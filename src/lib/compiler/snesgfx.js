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

// Real SNES OAM attribute byte bits, matching PVSnesLib's own sprite.h
// OBJ_PAL/OBJ_PRIO/OBJ_FLIPX/OBJ_FLIPY macros exactly (confirmed against the
// real vendored source, not guessed) - imageToMetaspriteData's `props` field
// is meant to be used as a real OAM attribute byte directly.
const OBJ_PAL = n => (n & 7) << 1;
const OBJ_PRIO = n => (n & 3) << 4;
const OBJ_FLIPX = 0x40;
const OBJ_FLIPY = 0x80;

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

// Shared by imageToSpriteData and imageToActorMetaspriteData (M8.1) so the
// two never silently drift apart on what a given sheet width / animationType
// override actually means.
//   frame count -> sprite_type: 3 = SPRITE_ACTOR (directional), 6 =
//   SPRITE_ACTOR_ANIMATED (walk cycle), any other 2..6 = SPRITE_STATIC that
//   auto-cycles all its frames (GB Studio's "animated" type, e.g. a 2-frame
//   duck, a 4-frame torch). 1 frame or >6 = frame 0 only.
// The Sprite Sheet editor's "Animation Type" field (SpriteSheet.animationType)
// re-interprets the same pixel rows under a different one of the 3 real
// types instead of changing how pixels are sliced - "fixed" always fits
// (re-labels a 3/6-frame sheet as a static auto-cycle of its own frames),
// "multi"/"multi_movement" need at least 3/6 real frames to pick from.
const detectActorFrameCountAndType = (sheetFrames, animationTypeOverride, filename, warnings) => {
  let frameCount = 1;
  let spriteType = 0;
  if (sheetFrames === 6) {
    frameCount = 6;
    spriteType = 2;
  } else if (sheetFrames === 3) {
    frameCount = 3;
    spriteType = 1;
  } else if (sheetFrames >= 2 && sheetFrames <= 6) {
    frameCount = sheetFrames;
    spriteType = 0;
  }
  if (animationTypeOverride === "fixed" && spriteType !== 0) {
    spriteType = 0;
  } else if (animationTypeOverride === "multi") {
    if (sheetFrames >= 3) {
      frameCount = 3;
      spriteType = 1;
    } else {
      warnings.push(
        `Sprite ${filename} is set to "Four Directions" but only has ${sheetFrames} ` +
          `16x16 frame(s) - needs at least 3. Falling back to auto-detected type.`
      );
    }
  } else if (animationTypeOverride === "multi_movement") {
    if (sheetFrames >= 6) {
      frameCount = 6;
      spriteType = 2;
    } else {
      warnings.push(
        `Sprite ${filename} is set to "Four Directions + Movement" but only has ` +
          `${sheetFrames} 16x16 frame(s) - needs at least 6. Falling back to auto-detected type.`
      );
    }
  }
  return { frameCount, spriteType };
};

const imageToSpriteData = async (filename, options = {}) => {
  const { maxColors = 16, animationTypeOverride } = options;
  const warnings = [];
  const pixels = await getPixels(filename);
  const [imgW, imgH] = pixels.shape;
  if (imgW < 16 || imgH < 16) {
    warnings.push(`Sprite ${filename} is ${imgW}x${imgH}, smaller than 16x16`);
  }
  const sheetFrames = Math.floor(imgW / FRAME_SIZE);
  const { frameCount, spriteType } = detectActorFrameCountAndType(
    sheetFrames,
    animationTypeOverride,
    filename,
    warnings
  );
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
      if (!seen.has(key)) {
        seen.add(key);
        colors.push([r, g, b]);
      }
    }
  }
  if (colors.length > maxColors) {
    warnings.push(
      `Sprite ${filename} has ${colors.length} colours, over the ${maxColors}-colour ` +
        `limit for a sprite sheet - extra colours are snapped to the nearest kept colour. ` +
        `Re-export as an indexed PNG with <= ${maxColors} colours.`
    );
    // keep first-seen order (colour 0 / top-left stays transparent), same
    // truncation imageToBGData uses for backgrounds
    colors.length = maxColors;
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
    colors, // raw 8-bit [r,g,b] list, same order as the palette - lets a
    // caller merge two sprites forced onto the same OBJ palette register
    // (compileSnesData.js's ACTOR_OBJ_PAL_POOL overflow) instead of one
    // clobbering the other
    colorCount: colors.length,
    frameCount,
    spriteType,
    warnings
  };
};

/*
 * imageToMetaspriteData - M5 of the real-metasprite-support effort
 * (SPRITE_EDITOR_PROGRESS.md). A JS port of PVSnesLib's own gfx4snes tool's
 * metasprite_save() (tools/gfx4snes/src/metasprites.c, read from a real
 * local checkout - not guessed), producing the same t_metasprite{dx,dy,tile,
 * props} shape its generated .inc files declare (see sprite.h), but as a
 * plain JS data structure rather than C source text - the C/asm emission
 * itself is out of scope here (SPRITE_EDITOR_PROGRESS.md's M8).
 *
 * Deliberate differences from gfx4snes's own implementation, each one a
 * considered choice, not an oversight:
 *   - gfx4snes's real metasprite tile-map pass runs with tile reduction
 *     explicitly OFF (`map_convertsnes(..., isnoreduction=1, ...)`, confirmed
 *     in gfx4snes.c's real call site) - it only disables *reduction*, not
 *     dedup, for implementation-simplicity reasons specific to its own
 *     later VRAM-layout pass. This function dedupes real 8x8 tiles properly
 *     (exact pixel match only, no flip-folding - see below), a real tile-
 *     budget win gfx4snes's simplified path doesn't bother with, since this
 *     function controls its own tile array end-to-end and doesn't inherit
 *     gfx4snes's reasons to avoid it.
 *   - No flip-folding during the initial tile dedup (unlike imageToBGData's
 *     own dedupeFlips): composing a per-tile dedup-flip with a whole-
 *     metasprite mirror-variant's own flip would need XOR-combining both
 *     flip bits correctly per tile, real but non-trivial complexity for a
 *     first pass. Exact-match dedup only; a metasprite's mirrored variant
 *     flips the *whole panel* via OBJ_FLIPX/Y on each item's existing tile,
 *     exactly matching gfx4snes's own real behaviour (it never re-derives
 *     tile content for a flip variant either - see metasprites.c).
 *   - `dtile` is a real index into this function's own `tiles[]` (actual
 *     8x8 SNES tile data, consistent and ready for VRAM placement) - NOT
 *     gfx4snes's own internal blockSize-granularity map index (which only
 *     stays meaningful relative to a separate, differently-reconverted
 *     tile-save pass downstream in the real tool; reusing that scheme here
 *     would need replicating a quirk specific to its own pipeline, not a
 *     real requirement of the t_metasprite format itself).
 *   - Blank-tile skipping reads raw pixels directly for each candidate
 *     sub-sprite's bounding box (every pixel maps to palette index 0),
 *     rather than gfx4snes's own post-hoc tile-buffer scan - equivalent
 *     result, simpler to reason about alongside the dedup pass above.
 *   - A stale-looking doc comment on PVSnesLib's own t_metasprite struct
 *     ("flip x/y will be added later") turned out NOT to reflect real
 *     behaviour - metasprite_save()'s actual flip-variant code already sets
 *     OBJ_FLIPX/OBJ_FLIPY in `props` today. Not a mistake on our side;
 *     flagged here so a future reader doesn't trust that comment over the
 *     real generator code.
 *
 * VRAM placement (ensuring a 16x16 sub-sprite's 4 real tiles land at the
 * N,N+1,N+16,N+17 hardware-addressable offsets this engine's existing OBJ
 * sheets rely on) is NOT handled here - that's compileSnesData.js's job
 * (M8), the same way imageToSpriteData's own output isn't VRAM-placed
 * until compileSnesData.js's placeTiles()/buildSceneSprites() run.
 */
const imageToMetaspriteData = async (filename, options = {}) => {
  const {
    maxColors = 16,
    blockSize = 16, // OBJ sub-sprite size: 8, 16 or 32
    metaWidth,
    metaHeight,
    priority = 0, // 0..3, OBJ_PRIO
    paletteSlot = 0, // 0..7, OBJ_PAL
    flip = 0, // bitmask: 1=flipX variant, 2=flipY variant, 4=flipX+Y variant
    // M8.1: per-metasprite-cell override of `flip`, indexed the same way
    // `metasprites[]` is pushed (linear index = my*metaCols+mx). Needed
    // because an actor sheet's directions don't all mirror the same way -
    // e.g. "side" needs a flipX variant (for facing left) but "down"/"up"
    // never do. Undefined entries (or no array at all) fall back to the
    // global `flip` above, so existing non-actor callers are unaffected.
    perIndexFlip
  } = options;
  const warnings = [];

  if (![8, 16, 32].includes(blockSize)) {
    throw new Error(`imageToMetaspriteData: blockSize must be 8, 16 or 32, got ${blockSize}`);
  }
  if (!metaWidth || !metaHeight || metaWidth % blockSize || metaHeight % blockSize) {
    throw new Error(
      `imageToMetaspriteData: metaWidth/metaHeight (${metaWidth}x${metaHeight}) must be ` +
        `set and a multiple of blockSize (${blockSize})`
    );
  }

  const pixels = await getPixels(filename);
  const [imgW, imgH] = pixels.shape;

  if (imgW % metaWidth !== 0 || imgH % metaHeight !== 0) {
    warnings.push(
      `Sprite ${filename} is ${imgW}x${imgH}, not an exact multiple of the ` +
        `${metaWidth}x${metaHeight} metasprite size - trailing rows/columns are dropped`
    );
  }
  const metaCols = Math.floor(imgW / metaWidth);
  const metaRows = Math.floor(imgH / metaHeight);

  // palette, scanned across the whole image
  let { colors } = extractColors(pixels);
  if (colors.length > maxColors) {
    warnings.push(
      `Sprite ${filename} has ${colors.length} colours, over the ${maxColors}-colour ` +
        `limit for a sprite sheet - extra colours are snapped to the nearest kept colour. ` +
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

  // Real 8x8 tile dedup across the whole sheet (exact pixel match only - see
  // header comment for why no flip-folding here).
  const tileW = Math.floor(imgW / TILE);
  const tileH = Math.floor(imgH / TILE);
  const tiles = [];
  const tileIndexAt = []; // [ty][tx] -> index into tiles[]
  const lookup = new Map();

  const rowsAt = (tx, ty) => {
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
    return rows;
  };

  for (let ty = 0; ty < tileH; ty++) {
    tileIndexAt.push([]);
    for (let tx = 0; tx < tileW; tx++) {
      const rows = rowsAt(tx, ty);
      const key = rowsKey(rows);
      let index = lookup.get(key);
      if (index === undefined) {
        index = tiles.length;
        tiles.push(tileFromIndices(rows));
        lookup.set(key, index);
      }
      tileIndexAt[ty][tx] = index;
    }
  }

  // Every pixel in a sub-sprite's bounding box maps to palette index 0.
  const subSpriteIsBlank = (pxX, pxY) => {
    for (let y = 0; y < blockSize; y++) {
      for (let x = 0; x < blockSize; x++) {
        const r = pixels.get(pxX + x, pxY + y, 0);
        const g = pixels.get(pxX + x, pxY + y, 1);
        const b = pixels.get(pxX + x, pxY + y, 2);
        if (colorIndex(r, g, b) !== 0) {
          return false;
        }
      }
    }
    return true;
  };

  const subCols = metaWidth / blockSize;
  const subRows = metaHeight / blockSize;
  const baseProps = OBJ_PAL(paletteSlot) | OBJ_PRIO(priority);

  const metasprites = [];
  for (let my = 0; my < metaRows; my++) {
    for (let mx = 0; mx < metaCols; mx++) {
      const originX = mx * metaWidth;
      const originY = my * metaHeight;
      const base = [];
      for (let sy = 0; sy < subRows; sy++) {
        for (let sx = 0; sx < subCols; sx++) {
          const pxX = originX + sx * blockSize;
          const pxY = originY + sy * blockSize;
          if (subSpriteIsBlank(pxX, pxY)) {
            continue;
          }
          // Hardware addresses a large OBJ's other tiles relative to the
          // top-left one (N, N+1, N+16, N+17 for 16x16) - dtile is that
          // top-left 8x8 tile's own deduped index; compileSnesData.js (M8)
          // is responsible for actually laying tiles[] out so that holds.
          const dtile = tileIndexAt[pxY / TILE][pxX / TILE];
          base.push({
            dx: sx * blockSize,
            dy: sy * blockSize,
            tile: dtile,
            props: baseProps
          });
        }
      }

      const variants = { base };
      const linearIndex = my * metaCols + mx;
      const cellFlip = Array.isArray(perIndexFlip) ? perIndexFlip[linearIndex] || 0 : flip;
      // Mirror offsets within the metasprite's own box, same OBJ_FLIPX/Y +
      // same tile indices gfx4snes's own flip-variant passes use - the
      // hardware flips the tile's pixels at render time, nothing to re-derive.
      if (cellFlip & 1) {
        variants.flipX = base.map(item => ({
          ...item,
          dx: metaWidth - blockSize - item.dx,
          props: item.props | OBJ_FLIPX
        }));
      }
      if (cellFlip & 2) {
        variants.flipY = base.map(item => ({
          ...item,
          dy: metaHeight - blockSize - item.dy,
          props: item.props | OBJ_FLIPY
        }));
      }
      if (cellFlip & 4) {
        variants.flipXY = base.map(item => ({
          ...item,
          dx: metaWidth - blockSize - item.dx,
          dy: metaHeight - blockSize - item.dy,
          props: item.props | OBJ_FLIPX | OBJ_FLIPY
        }));
      }
      metasprites.push(variants);
    }
  }

  const palette = paletteToBGR555(colors);
  palette[0] = 0; // force transparent, matching imageToSpriteData's own convention
  const tileBytes = [].concat(...tiles);

  return {
    tiles,
    tileBytes,
    palette,
    paletteBytes: paletteBytes(palette),
    colorCount: colors.length,
    blockSize,
    metaWidth,
    metaHeight,
    metaCols,
    metaRows,
    metasprites,
    warnings
  };
};

/*
 * imageToActorMetaspriteData - M8.1 of the real-metasprite-support effort
 * (SPRITE_EDITOR_PROGRESS.md). Thin wrapper around imageToMetaspriteData
 * that derives metaWidth/metaHeight/blockSize from an actor sheet's own
 * frame layout (same detection imageToSpriteData uses, shared via
 * detectActorFrameCountAndType above so the two paths can't drift), instead
 * of taking them as free-form options the way the core function does.
 *
 * GB Studio actor sheets are a single row of 16x16 frames; each frame is one
 * metasprite cell (metaWidth=metaHeight=blockSize=16px, i.e. exactly the
 * existing 2x2-tile OBJ block this engine already renders per direction/
 * pose). The "side" pose's left-facing mirror is a real OBJ_FLIPX variant
 * (today's engine always derives it from the same "side" tiles - see
 * actor_render_tile - there is no per-sheet choice to not mirror it), so
 * only the side/side-B cells get a flipX variant generated; down/up/down-B/
 * up-B never do (matching this project's own "flipLeft is always on, not a
 * user choice" scoping decision).
 */
const imageToActorMetaspriteData = async (filename, options = {}) => {
  const { maxColors = 16, animationTypeOverride, priority = 0, paletteSlot = 0 } = options;
  const warnings = [];
  const pixels = await getPixels(filename);
  const [imgW] = pixels.shape;
  const sheetFrames = Math.floor(imgW / FRAME_SIZE);
  const { frameCount, spriteType } = detectActorFrameCountAndType(
    sheetFrames,
    animationTypeOverride,
    filename,
    warnings
  );

  // spriteType 1 (SPRITE_ACTOR: down,up,side) -> side is index 2.
  // spriteType 2 (SPRITE_ACTOR_ANIMATED: down-a,down-b,up-a,up-b,side-a,
  // side-b) -> side poses are indices 4,5. spriteType 0 (static/auto-cycle)
  // never mirrors - every frame is its own authored pose, not a direction.
  let sideFrameIndices = [];
  if (spriteType === 1) {
    sideFrameIndices = [2];
  } else if (spriteType === 2) {
    sideFrameIndices = [4, 5];
  }
  const perIndexFlip = new Array(sheetFrames).fill(0);
  sideFrameIndices.forEach(i => {
    perIndexFlip[i] = 1; // flipX variant only
  });

  const result = await imageToMetaspriteData(filename, {
    maxColors,
    blockSize: FRAME_SIZE,
    metaWidth: FRAME_SIZE,
    metaHeight: FRAME_SIZE,
    priority,
    paletteSlot,
    perIndexFlip
  });

  // Actor sheets are always a single row - only the real frameCount cells
  // (left-to-right) are meaningful; a sheet wider than it needs to be for
  // its detected type (e.g. extra unused columns) is trimmed here rather
  // than carrying dead metasprite entries forward.
  const metasprites = result.metasprites.slice(0, frameCount);

  return {
    ...result,
    metasprites,
    metaCols: frameCount,
    metaRows: 1,
    frameCount,
    spriteType,
    sideFrameIndices,
    warnings: [...warnings, ...result.warnings]
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
  imageToMetaspriteData,
  imageToActorMetaspriteData,
  decodeBGData
};
