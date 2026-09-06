/*
 * Engine assets that don't come from the project: the BG3 dialogue font, a
 * placeholder 16x16 player sprite, and the 8 emote bubbles (M5c). Shared by the
 * real data compiler (compileSnesData.js) and the throwaway generator
 * (appData/src/snes/tools/gen-dummy-gfx.js) so both emit byte-identical data.
 *
 * OBJ sheet layout (8 KB, 256 tiles = the whole first OBJ name page, 16-wide
 * grid): slot k -> tiles 2k, 2k+1, 2k+16, 2k+17. Regions (all 8-slot / 32-tile):
 *   0-31    actor "down" pose A  (slot 0 seeded with the placeholder)
 *   32-63   the 8 emotes
 *   64-95   up to 8 dialogue avatars
 *   96-127  actor "up" pose A
 *   128-159 actor "side" pose A
 *   160-191 actor "down" pose B   \  M7-cont. phase 2: the 2nd walk-cycle pose
 *   192-223 actor "up" pose B      >  of a 6-frame SPRITE_ACTOR_ANIMATED sheet
 *   224-255 actor "side" pose B   /   (3-frame SPRITE_ACTOR sheets use only "A")
 * The direction regions are appended (not interleaved into slots 0-7) because
 * placeTiles' fixed `16 + 2*slot` bottom-row offset only stays collision-free
 * for 8 slots per region - see AVATAR_SLOT0 for what happens otherwise. The
 * sheet is now full (256 tiles); anything more would need the 2nd OBJ page.
 *
 * OBJ palettes (8, CGRAM 128..255, 16 colours each): palette 1 = the emotes,
 * palette 2 = the dialogue avatars, so actor sprite slots draw their own
 * 16-colour palette from the pool {0, 3, 4, 5, 6, 7} (compileSnesData.js's
 * ACTOR_OBJ_PAL_POOL / sprite_pal_for_slot[]). A project with 7-8 distinct
 * sprite sheets reuses palette 0 for the overflow.
 */
const path = require("path");
const getPixels = require("util").promisify(require("get-pixels"));

const TOOLS = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "appData",
  "src",
  "snes",
  "tools"
);
const EMOTES_PNG = path.join(TOOLS, "emotes.png");

// The BG3 UI graphics come from a project's assets/ui/{ascii,frame,cursor}.png
// (same files the Game Boy target uses). When no project dir is given - the
// dummy-asset generator (gen-dummy-gfx.js) - fall back to the stock sample's.
const DEFAULT_UI_DIR = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "appData",
  "templates",
  "gbhtml",
  "assets",
  "ui"
);

// ascii.png is a 16-wide glyph grid; GB Studio's font covers char 0x20..0xFF.
const NUM_UI_GLYPHS = 224;
const UI_FILL_TILE = NUM_UI_GLYPHS; // solid dark tile - the OVERLAY_SHOW panel
const UI_FRAME_TILE0 = NUM_UI_GLYPHS + 1; // 9 nine-slice tiles: TL T TR L C R BL B BR
const UI_CURSOR_TILE = NUM_UI_GLYPHS + 10; // menu ">" pointer
const NUM_EMOTES = 8;
const EMOTE_TILE0 = 32; // OBJ grid tile of emote 0
const AVATAR_TILE0 = 64; // OBJ grid tile of avatar 0
// placeTiles(slot, ...) (compileSnesData.js) writes tile 2*slot - AVATAR_SLOT0
// must be AVATAR_TILE0/2, not a "logical slot number" in some other unit.
// Was 16 (-> tile 32, the SAME range as the emotes above it): avatars silently
// overwrote emote 0's tile data, and the engine's own AVATAR_TILE0-relative
// reads (ui.c) found only the untouched zero-filled placeholder at tile 64,
// so TEXT_WITH_AVATAR rendered a blank portrait. Found while re-deriving this
// layout for the sprite-direction-frames work below - not caught by earlier
// per-feature Mesen checks because they didn't screenshot emotes and avatars
// in the same run.
const AVATAR_SLOT0 = 32;
// Direction frames (M7-cont. phase 1): a 3-frame actor sheet's "up"/"side"
// frames get their OWN 8-slot regions, appended after the existing 96-tile
// sheet (actors 0-31, emotes 32-63, avatars 64-95) rather than growing the
// 0-7 actor slot range itself - placeTiles' `16 + 2*slot` bottom-row offset
// only stays collision-free for slots 0-7 in one region (see AVATAR_SLOT0
// above for what happens when that's violated), so a 4th/5th region reusing
// the same 8-slot addressing is far safer than trying to widen the existing
// one. "down" (frame 0) keeps using the actor's existing frame_offset
// unchanged - only sprites with 3 real frames populate these.
const ACTOR_UP_TILE0 = 96;
const ACTOR_SIDE_TILE0 = 128;
const ACTOR_UP_SLOT0 = ACTOR_UP_TILE0 / 2; // 48 - placeTiles(slot,...) input
const ACTOR_SIDE_SLOT0 = ACTOR_SIDE_TILE0 / 2; // 64
// Phase 2 - the "B" (2nd walk pose) region of each direction, for a 6-frame
// SPRITE_ACTOR_ANIMATED sheet. A 3-frame sheet leaves these zero.
const ACTOR_DOWN_B_TILE0 = 160;
const ACTOR_UP_B_TILE0 = 192;
const ACTOR_SIDE_B_TILE0 = 224;
const ACTOR_DOWN_B_SLOT0 = ACTOR_DOWN_B_TILE0 / 2; // 80
const ACTOR_UP_B_SLOT0 = ACTOR_UP_B_TILE0 / 2; // 96
const ACTOR_SIDE_B_SLOT0 = ACTOR_SIDE_B_TILE0 / 2; // 112
const SHEET_TILES = 256; // fills the whole first OBJ name page

// 8-bit r,g,b (0..31 each) -> BGR555 low/high bytes
const palBytes = colours => {
  const out = [];
  for (const [r, g, b] of colours) {
    const w = ((b & 31) << 10) | ((g & 31) << 5) | (r & 31);
    out.push(w & 0xff, (w >> 8) & 0xff);
  }
  return out;
};

// 8 rows of 8-nibble strings -> 32 bytes of SNES 4bpp planar data
const tile4bpp = rows => {
  const out = [];
  for (let plane = 0; plane < 4; plane += 2) {
    for (let y = 0; y < 8; y++) {
      let lo = 0;
      let hi = 0;
      for (let x = 0; x < 8; x++) {
        const v = parseInt(rows[y][x], 16);
        lo |= ((v >> plane) & 1) << (7 - x);
        hi |= ((v >> (plane + 1)) & 1) << (7 - x);
      }
      out.push(lo, hi);
    }
  }
  return out;
};

// pixels -> palette-index rows for one 8x8 quad, extracting a shared palette
const quadFromPixels = (pixels, ox, oy, colors, keyIndex) => {
  const rows = [];
  for (let y = 0; y < 8; y++) {
    const row = [];
    for (let x = 0; x < 8; x++) {
      const r = pixels.get(ox + x, oy + y, 0);
      const g = pixels.get(ox + x, oy + y, 1);
      const b = pixels.get(ox + x, oy + y, 2);
      row.push(keyIndex(r, g, b, colors));
    }
    rows.push(row);
  }
  return tile4bpp(rows);
};

// 8 rows of 8 palette indices (0..3) -> 16 bytes of SNES 2bpp planar data
// (BG3 in Mode 1 is 2bpp): bp0/bp1 interleaved, one byte pair per row.
const tile2bpp = rows => {
  const out = [];
  for (let y = 0; y < 8; y++) {
    let lo = 0;
    let hi = 0;
    for (let x = 0; x < 8; x++) {
      const v = rows[y][x] & 3;
      lo |= (v & 1) << (7 - x);
      hi |= ((v >> 1) & 1) << (7 - x);
    }
    out.push(lo, hi);
  }
  return out;
};

const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Build the BG3 UI tile blob + 4-colour palette from a project's
// assets/ui/{ascii,frame,cursor}.png. Blob tile order:
//   [0 .. NUM_UI_GLYPHS-1]  glyphs (char 0x20..0xFF)
//   [UI_FILL_TILE]          solid darkest colour - the OVERLAY_SHOW panel
//   [UI_FRAME_TILE0 .. +8]  nine-slice frame  TL T TR / L C R / BL B BR
//   [UI_CURSOR_TILE]        the menu ">" pointer
// Palette: index 0 is left unused (BG colour 0 is transparent); the image's
// colours are mapped to 1..3 by luminance (lightest = box interior), a 4th
// colour snaps to the nearest of those - the stock UI art is 2-4 GB shades.
const buildUiGfx = async uiDir => {
  const load = async name => {
    const px = await getPixels(path.join(uiDir, name));
    const [w, h] = px.shape;
    return { px, w, h };
  };
  const ascii = await load("ascii.png");
  const frame = await load("frame.png");
  const cursor = await load("cursor.png");

  // collect distinct colours across all three images
  const seen = new Map();
  const scan = ({ px, w, h }) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = [px.get(x, y, 0), px.get(x, y, 1), px.get(x, y, 2)];
        seen.set(c.join(","), c);
      }
    }
  };
  scan(ascii);
  scan(frame);
  scan(cursor);

  // -> palette indices 1,2,3. BG3 colour 0 is transparent, so an opaque box
  // gets at most 3 colours: keep the lightest (box interior) and the darkest
  // (text/border), fill the middle slot, and snap any extra to the nearest.
  const distinct = [...seen.values()].sort((a, b) => lum(b) - lum(a));
  let palColours;
  if (distinct.length <= 3) {
    palColours = distinct.slice();
  } else {
    palColours = [distinct[0], distinct[1], distinct[distinct.length - 1]];
  }
  while (palColours.length < 3) palColours.push([0, 0, 0]);
  const nearest = c => {
    let best = 0;
    let bd = Infinity;
    palColours.forEach((p, i) => {
      const d =
        (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best + 1; // -> 1..3
  };
  const idxOf = c => nearest(c);

  const quad = ({ px }, ox, oy) => {
    const rows = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 8; x++) {
        row.push(idxOf([px.get(ox + x, oy + y, 0), px.get(ox + x, oy + y, 1), px.get(ox + x, oy + y, 2)]));
      }
      rows.push(row);
    }
    return tile2bpp(rows);
  };
  const solid = i => tile2bpp(new Array(8).fill(new Array(8).fill(i)));

  const out = [];
  // glyphs - ascii.png is 16 tiles wide. Tile 0 (char 0x20, space) is forced
  // fully transparent: it doubles as UI_BLANK, the tile every BG3 cell outside
  // the dialogue box holds, so it must not paint over the scene. Spaces inside
  // text are drawn as the box-fill tile instead (see UI_CHAR in ui.c).
  const cols = ascii.w >> 3;
  for (let t = 0; t < NUM_UI_GLYPHS; t++) {
    const gx = (t % cols) * 8;
    const gy = ((t / cols) | 0) * 8;
    if (t === 0) {
      out.push(...solid(0)); // space = transparent, doubles as UI_BLANK
    } else if (gy + 8 <= ascii.h) {
      out.push(...quad(ascii, gx, gy));
    } else {
      out.push(...solid(1));
    }
  }
  out.push(...solid(3)); // UI_FILL_TILE - darkest, the overlay curtain
  // frame nine-slice, row-major TL T TR / L C R / BL B BR
  for (let fy = 0; fy < 3; fy++) {
    for (let fx = 0; fx < 3; fx++) {
      out.push(...quad(frame, fx * 8, fy * 8));
    }
  }
  out.push(...quad(cursor, 0, 0));

  // palette: [0]=unused, [1..3] by luminance (bytes = BGR555 lo/hi)
  const words = [0].concat(
    palColours.map(([r, g, b]) =>
      (((b >> 3) & 31) << 10) | (((g >> 3) & 31) << 5) | ((r >> 3) & 31)
    )
  );
  const palOut = [];
  for (const w of words) palOut.push(w & 0xff, (w >> 8) & 0xff);

  return { font: out, palette: palOut };
};

const SPR_PALETTE = [
  [0, 0, 0],
  [2, 2, 4],
  [30, 22, 17],
  [7, 10, 27],
  [11, 9, 7],
  [31, 31, 31]
];

// 16x16 placeholder player, OBJ grid tiles 0,1 / 16,17
const SPR = [
  "0000011111100000",
  "0000122222210000",
  "0001222222221000",
  "0001225225221000",
  "0001225225221000",
  "0001222222221000",
  "0001221221221000",
  "0000122222210000",
  "0001333333331000",
  "0013333333333100",
  "0013333333333100",
  "0013333333333100",
  "0001333333331000",
  "0001440000441000",
  "0001440000441000",
  "0000110000110000"
];

const buildSpriteSheet = async () => {
  const sheet = new Array(SHEET_TILES * 32).fill(0); // 256 tiles, 8 KB. The
  // actor direction regions (tiles 96-255) stay zero here - populated per-
  // project by compileSnesData.js's placeTiles(), same as the avatar region.

  // slot 0: the placeholder player (grid tiles 0,1,16,17)
  const quad = (ox, oy) => {
    const rows = [];
    for (let y = 0; y < 8; y++) rows.push(SPR[oy + y].slice(ox, ox + 8));
    return tile4bpp(rows);
  };
  const parts = [[0, 0, 0], [1, 8, 0], [16, 0, 8], [17, 8, 8]];
  for (const [tile, ox, oy] of parts) {
    const q = quad(ox, oy);
    for (let i = 0; i < 32; i++) sheet[tile * 32 + i] = q[i];
  }

  // emotes.png: 128x16 = 8 emotes of 16x16, first-seen palette (<=16 colours)
  const pixels = await getPixels(EMOTES_PNG);
  const colors = [];
  const seen = new Map();
  const key = (r, g, b, list) => {
    const k = (r << 16) | (g << 8) | b;
    if (seen.has(k)) return seen.get(k);
    if (list.length < 16) {
      seen.set(k, list.length);
      list.push([r, g, b]);
      return list.length - 1;
    }
    return 0;
  };
  for (let e = 0; e < NUM_EMOTES; e++) {
    // emote e -> grid tiles (32+2e), (33+2e), (48+2e), (49+2e)
    const t = [EMOTE_TILE0 + 2 * e, EMOTE_TILE0 + 2 * e + 1, EMOTE_TILE0 + 16 + 2 * e, EMOTE_TILE0 + 17 + 2 * e];
    const q = [
      quadFromPixels(pixels, e * 16, 0, colors, key),
      quadFromPixels(pixels, e * 16 + 8, 0, colors, key),
      quadFromPixels(pixels, e * 16, 8, colors, key),
      quadFromPixels(pixels, e * 16 + 8, 8, colors, key)
    ];
    q.forEach((tile, qi) => {
      for (let i = 0; i < 32; i++) sheet[t[qi] * 32 + i] = tile[i];
    });
  }
  colors[0] = [0, 0, 0]; // colour 0 transparent
  return { sheet, emoteColors: colors };
};

const snesFixedAssets = async ({ uiAssetDir } = {}) => {
  const { sheet, emoteColors } = await buildSpriteSheet();
  const ui = await buildUiGfx(uiAssetDir || DEFAULT_UI_DIR);
  return {
    uiFont: ui.font,
    uiPaletteBytes: ui.palette,
    spriteTiles: sheet,
    spritePaletteBytes: palBytes(SPR_PALETTE),
    emotePaletteBytes: palBytes(emoteColors),
    UI_FILL_TILE,
    NUM_UI_GLYPHS,
    UI_FRAME_TILE0,
    UI_CURSOR_TILE,
    NUM_EMOTES,
    EMOTE_TILE0,
    AVATAR_TILE0,
    AVATAR_SLOT0,
    ACTOR_UP_TILE0,
    ACTOR_SIDE_TILE0,
    ACTOR_UP_SLOT0,
    ACTOR_SIDE_SLOT0,
    ACTOR_DOWN_B_TILE0,
    ACTOR_UP_B_TILE0,
    ACTOR_SIDE_B_TILE0,
    ACTOR_DOWN_B_SLOT0,
    ACTOR_UP_B_SLOT0,
    ACTOR_SIDE_B_SLOT0
  };
};

module.exports = { snesFixedAssets, palBytes, tile4bpp, UI_FILL_TILE };
