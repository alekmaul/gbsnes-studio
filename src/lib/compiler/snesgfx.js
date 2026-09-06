/*
 * snesgfx.js - the SNES counterpart of ggbgfx.js (M6).
 *
 * ggbgfx.js turns a PNG into Game Boy 2bpp tiles with a hard-coded 4-shade
 * green-channel heuristic. snesgfx.js instead:
 *   - extracts the real palette from the image (up to 16 colours for a 4bpp
 *     background layer), 8-bit RGB -> 15-bit BGR555
 *   - packs 8x8 tiles as SNES 4bpp planar data (32 bytes/tile)
 *   - de-duplicates tiles, matching H/V flips, and emits a 16-bit tilemap
 *     (tile | palette<<10 | prio<<13 | xflip<<14 | yflip<<15)
 *
 * Pure helpers take pixel arrays so they can be unit tested without a PNG;
 * `imageToBGData(filename)` is the file-level entry point.
 *
 * NOT wired into compileImages/compileData yet - that (plus VRAM-budget tile
 * limits and the palette_bank_ptrs table) is the rest of M6/M7. For now the
 * SNES engine's dummy-asset generator can call this to show a real background.
 */
const getPixels = require("util").promisify(require("get-pixels"));

const TILE = 8;
const MAX_BG_COLORS = 16;

/* ---- colour ---------------------------------------------------------- */

// 8-bit R,G,B -> 15-bit BGR555 word (SNES CGRAM entry), 0bbbbbgggggrrrrr
const rgbToBGR555 = (r, g, b) => {
  const r5 = (r >> 3) & 0x1f;
  const g5 = (g >> 3) & 0x1f;
  const b5 = (b >> 3) & 0x1f;
  return (b5 << 10) | (g5 << 5) | r5;
};

// [ [r,g,b], ... ] -> [ word, ... ], padded to `size` entries with 0
const paletteToBGR555 = (colors, size) => {
  const out = colors.map(([r, g, b]) => rgbToBGR555(r, g, b));
  const n = size || out.length;
  while (out.length < n) out.push(0);
  return out;
};

// low/high byte stream for a palette word array (CGRAM DMA order)
const paletteBytes = words => {
  const out = [];
  for (const w of words) {
    out.push(w & 0xff, (w >> 8) & 0xff);
  }
  return out;
};

/* ---- tiles ---------------------------------------------------------- */

// rows: 8 arrays of 8 palette indices (0..15). Returns 32 bytes of SNES 4bpp
// planar data: [bp0/bp1 interleaved for 8 rows][bp2/bp3 interleaved for 8 rows].
const tileFromIndices = rows => {
  const bytes = [];
  for (const planePair of [0, 2]) {
    for (let y = 0; y < TILE; y++) {
      let lo = 0;
      let hi = 0;
      for (let x = 0; x < TILE; x++) {
        const v = rows[y][x] & 0x0f;
        const bit = 7 - x;
        lo |= ((v >> planePair) & 1) << bit;
        hi |= ((v >> (planePair + 1)) & 1) << bit;
      }
      bytes.push(lo, hi);
    }
  }
  return bytes;
};

const flipRowsH = rows => rows.map(r => r.slice().reverse());
const flipRowsV = rows => rows.slice().reverse();
const rowsKey = rows => rows.map(r => r.join(",")).join("|");

/* ---- image -------------------------------------------------------- */

// Walk the image, collect unique colours in first-seen (raster) order.
const extractColors = pixels => {
  const [w, h] = pixels.shape;
  const seen = new Map();
  const colors = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = pixels.get(x, y, 0);
      const g = pixels.get(x, y, 1);
      const b = pixels.get(x, y, 2);
      const key = (r << 16) | (g << 8) | b;
      if (!seen.has(key)) {
        seen.set(key, colors.length);
        colors.push([r, g, b]);
      }
    }
  }
  return { colors, keyOf: (r, g, b) => (r << 16) | (g << 8) | b, seen };
};

const dist2 = (a, b) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
};

/*
 * PNG -> SNES background data.
 *   { palette, paletteBytes, tiles, tileBytes, tilemap, tileW, tileH,
 *     tileCount, warnings }
 * options: { maxColors, dedupeFlips (default true), paletteSlot (default 0),
 *            priority (default false) }
 */
const imageToBGData = async (filename, options = {}) => {
  const {
    maxColors = MAX_BG_COLORS,
    maxTiles = 0, // 0 = no check; targets/snes.js maxTilesetTiles feeds this
    dedupeFlips = true,
    paletteSlot = 0,
    priority = false
  } = options;
  const warnings = [];
  const pixels = await getPixels(filename);
  const [imgW, imgH] = pixels.shape;

  if (imgW % TILE !== 0 || imgH % TILE !== 0) {
    warnings.push(
      `Image ${filename} is ${imgW}x${imgH}, not a multiple of 8 - edge pixels are dropped`
    );
  }
  const tileW = Math.floor(imgW / TILE);
  const tileH = Math.floor(imgH / TILE);

  // palette
  let { colors } = extractColors(pixels);
  if (colors.length > maxColors) {
    warnings.push(
      `Image ${filename} has ${colors.length} colours, over the ${maxColors}-colour ` +
        `limit for a background - extra colours are snapped to the nearest kept colour. ` +
        `Re-export as an indexed PNG with <= ${maxColors} colours.`
    );
    colors = colors.slice(0, maxColors);
  }
  const colorIndex = (r, g, b) => {
    for (let i = 0; i < colors.length; i++) {
      if (colors[i][0] === r && colors[i][1] === g && colors[i][2] === b) {
        return i;
      }
    }
    // over-limit colour: nearest kept
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const d = dist2(colors[i], [r, g, b]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  // tiles + tilemap
  const tiles = [];
  const lookup = new Map(); // orientation key -> { index, xflip, yflip }
  const tilemap = [];
  const palBits = (paletteSlot & 7) << 10;
  const prioBit = priority ? 1 << 13 : 0;

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const rows = [];
      for (let y = 0; y < TILE; y++) {
        const row = [];
        for (let x = 0; x < TILE; x++) {
          row.push(
            colorIndex(
              pixels.get(tx * TILE + x, ty * TILE + y, 0),
              pixels.get(tx * TILE + x, ty * TILE + y, 1),
              pixels.get(tx * TILE + x, ty * TILE + y, 2)
            )
          );
        }
        rows.push(row);
      }

      // Each stored tile is keyed by its own pixels. To place the current tile
      // we test its 4 orientations against those keys: a hit on flipH(current)
      // means the stored tile == flipH(current), so display it with xflip set.
      const orientations = dedupeFlips
        ? [
            [rows, 0, 0],
            [flipRowsH(rows), 1, 0],
            [flipRowsV(rows), 0, 1],
            [flipRowsV(flipRowsH(rows)), 1, 1]
          ]
        : [[rows, 0, 0]];

      let entry = null;
      for (const [r, xf, yf] of orientations) {
        const hitIndex = lookup.get(rowsKey(r));
        if (hitIndex !== undefined) {
          entry = { index: hitIndex, xflip: xf, yflip: yf };
          break;
        }
      }
      if (!entry) {
        const index = tiles.length;
        tiles.push(tileFromIndices(rows));
        lookup.set(rowsKey(rows), index);
        entry = { index, xflip: 0, yflip: 0 };
      }

      tilemap.push(
        (entry.index & 0x3ff) |
          palBits |
          prioBit |
          (entry.xflip << 14) |
          (entry.yflip << 15)
      );
    }
  }

  if (maxTiles && tiles.length > maxTiles) {
    warnings.push(
      `Image ${filename} needs ${tiles.length} unique 8x8 tiles, over the ` +
        `${maxTiles}-tile VRAM budget for one background layer - it may not ` +
        `display correctly. Reduce the detail in this image.`
    );
  }

  const palette = paletteToBGR555(colors);
  const tileBytes = [].concat(...tiles);

  return {
    palette,
    paletteBytes: paletteBytes(palette),
    tiles,
    tileBytes,
    tilemap,
    tileW,
    tileH,
    tileCount: tiles.length,
    colorCount: colors.length,
    warnings
  };
};

/*
 * GB Studio sprite sheet (16px tall, 16*numFrames wide) -> the first 16x16
 * frame as 4 SNES 4bpp OBJ tiles in TL, TR, BL, BR order, plus a 16-colour
 * BGR555 palette. Colour 0 is forced transparent.
 *   { tiles: [ [32]*4 ], tileBytes, paletteBytes, colorCount, warnings }
 */
// GB Studio actor sheets are a single row of 16x16 frames (numFrames =
// width/16). Following spriteTypeFromNumFrames/directionToFrame in
// src/lib/helpers/gbstudio.js:
//   3 frames = one facing per direction (down / up / side, side flipped for
//     the opposite direction) - SPRITE_ACTOR.
//   6 frames = two walk-cycle poses per direction, laid out
//     [down-a, down-b, up-a, up-b, side-a, side-b] - SPRITE_ACTOR_ANIMATED.
//   anything else = only the first 16x16 frame is used (SPRITE_STATIC).
// The per-actor sprite_type also depends on movement type (a 6-frame sheet on
// a non-moving actor is a manual/auto 6-frame cycle, not a walk cycle) - that
// call is made in compileSnesData.js; this function just reports the frame
// count and the frame-count-only type.
const FRAME_SIZE = 16;

const imageToSpriteData = async (filename, options = {}) => {
  const { maxColors = 16 } = options;
  const warnings = [];
  const pixels = await getPixels(filename);
  const [imgW, imgH] = pixels.shape;
  if (imgW < 16 || imgH < 16) {
    warnings.push(`Sprite ${filename} is ${imgW}x${imgH}, smaller than 16x16`);
  }
  const sheetFrames = Math.floor(imgW / FRAME_SIZE);
  // frame count -> sprite_type (SPRITE_STATIC 0 / SPRITE_ACTOR 1 /
  // SPRITE_ACTOR_ANIMATED 2); any count other than 3 or 6 reads frame 0 only.
  let frameCount = 1;
  let spriteType = 0;
  if (sheetFrames === 6) {
    frameCount = 6;
    spriteType = 2;
  } else if (sheetFrames === 3) {
    frameCount = 3;
    spriteType = 1;
  }
  const scanW = Math.min(FRAME_SIZE * frameCount, imgW);

  // palette: colour 0 (top-left pixel / transparent) first, then the rest,
  // scanned across every frame that will actually be used
  const first = [pixels.get(0, 0, 0), pixels.get(0, 0, 1), pixels.get(0, 0, 2)];
  const colors = [first];
  const seen = new Set([(first[0] << 16) | (first[1] << 8) | first[2]]);
  for (let y = 0; y < Math.min(16, imgH); y++) {
    for (let x = 0; x < scanW; x++) {
      const r = pixels.get(x, y, 0);
      const g = pixels.get(x, y, 1);
      const b = pixels.get(x, y, 2);
      const key = (r << 16) | (g << 8) | b;
      if (!seen.has(key) && colors.length < maxColors) {
        seen.add(key);
        colors.push([r, g, b]);
      }
    }
  }
  const idx = (r, g, b) => {
    for (let i = 0; i < colors.length; i++) {
      if (colors[i][0] === r && colors[i][1] === g && colors[i][2] === b) return i;
    }
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < colors.length; i++) {
      const d = dist2(colors[i], [r, g, b]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  };

  const quad = (ox, oy) => {
    const rows = [];
    for (let y = 0; y < TILE; y++) {
      const row = [];
      for (let x = 0; x < TILE; x++) {
        row.push(
          idx(
            pixels.get(ox + x, oy + y, 0),
            pixels.get(ox + x, oy + y, 1),
            pixels.get(ox + x, oy + y, 2)
          )
        );
      }
      rows.push(row);
    }
    return tileFromIndices(rows);
  };

  // One 4-tile group (TL,TR,BL,BR) per frame, in sheet order -> 4/12/24 tiles
  // for 1/3/6 frames. compileSnesData.js places them into the OBJ sheet's
  // direction regions.
  const tiles = [];
  for (let f = 0; f < frameCount; f++) {
    const fx = f * FRAME_SIZE;
    tiles.push(quad(fx, 0), quad(fx + 8, 0), quad(fx, 8), quad(fx + 8, 8));
  }
  const pal = paletteToBGR555(colors);
  pal[0] = 0; // force transparent
  return {
    tiles,
    tileBytes: [].concat(...tiles),
    paletteBytes: paletteBytes(pal),
    colorCount: colors.length,
    frameCount,
    spriteType,
    warnings
  };
};

// 32 bytes of 4bpp planar data -> 8 rows of 8 palette indices (inverse of
// tileFromIndices). Used to verify a conversion round-trips losslessly.
const indicesFromTile = bytes => {
  const rows = [];
  for (let y = 0; y < TILE; y++) {
    const row = [];
    for (let x = 0; x < TILE; x++) {
      const bit = 7 - x;
      const b0 = (bytes[y * 2] >> bit) & 1;
      const b1 = (bytes[y * 2 + 1] >> bit) & 1;
      const b2 = (bytes[16 + y * 2] >> bit) & 1;
      const b3 = (bytes[16 + y * 2 + 1] >> bit) & 1;
      row.push(b0 | (b1 << 1) | (b2 << 2) | (b3 << 3));
    }
    rows.push(row);
  }
  return rows;
};

// Rebuild the full palette-index image from imageToBGData() output.
const decodeBGData = ({ tiles, tilemap, tileW, tileH }) => {
  const decoded = tiles.map(indicesFromTile);
  const out = Array.from({ length: tileH * TILE }, () =>
    Array(tileW * TILE).fill(0)
  );
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const e = tilemap[ty * tileW + tx];
      let rows = decoded[e & 0x3ff];
      if (e & (1 << 14)) rows = flipRowsH(rows);
      if (e & (1 << 15)) rows = flipRowsV(rows);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          out[ty * TILE + y][tx * TILE + x] = rows[y][x];
        }
      }
    }
  }
  return out;
};

module.exports = {
  rgbToBGR555,
  paletteToBGR555,
  paletteBytes,
  tileFromIndices,
  indicesFromTile,
  flipRowsH,
  flipRowsV,
  extractColors,
  imageToBGData,
  imageToSpriteData,
  decodeBGData
};
