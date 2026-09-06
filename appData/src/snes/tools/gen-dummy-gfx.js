/*
 * Dummy-graphics / test-data generator for the SNES engine.
 *
 * Emits appData/src/snes/src/assets.{c,h}:
 *   - a per-scene BG table (bg_tiles_ptrs/bg_maps_ptrs/bg_pals_ptrs + sizes):
 *       bg 0 = the hand-rolled 64x64 dummy map (M4c collision demo)
 *       bg 1 = a REAL GB Studio background (mabe_house.png) run through
 *              src/lib/compiler/snesgfx.js  <- the M6 converter, on hardware
 *   - a 16x16 player sprite sheet
 *   - the BG3 dialogue font + palette + strings (M5)
 *   - scene blobs, scripts, event/string pointer tables
 *
 * Throwaway: M7 replaces this with data emitted by the JS compiler.
 */
const fs = require("fs");
const path = require("path");
const { imageToBGData } = require(path.resolve(
  __dirname,
  "../../../../src/lib/compiler/snesgfx"
));
const MABE_PNG = path.resolve(
  __dirname,
  "../../../../test/data/compiler/_files/assets/backgrounds/mabe_house.png"
);

// ---- 4bpp planar encoder -------------------------------------------------
// rows: 8 strings of 8 hex nibbles (palette index 0-15). Returns 32 bytes.
function tile4bpp(rows) {
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
}

// colours: [[r,g,b], ...] each 0-31. Returns BGR555 little-endian bytes.
function palBytes(colours) {
  const out = [];
  for (const [r, g, b] of colours) {
    const w = ((b & 31) << 10) | ((g & 31) << 5) | (r & 31);
    out.push(w & 0xff, (w >> 8) & 0xff);
  }
  // pad to 16 entries
  while (out.length < 32) out.push(0);
  return out;
}

// ---- BG tileset --------------------------------------------------------
const bgPalette = [
  [2, 2, 3],    // 0 backdrop (dark blue-grey)
  [12, 10, 8],  // 1 floor mid
  [16, 14, 11], // 2 floor light
  [9, 6, 4],    // 3 wall dark
  [17, 12, 8],  // 4 wall light
  [4, 13, 4],   // 5 grass dark
  [9, 22, 9],   // 6 grass light
  [28, 24, 5]   // 7 marker (yellow)
];

const T_FLOOR = [
  "11111111",
  "12111121",
  "11111111",
  "11111111",
  "11211111",
  "11111111",
  "12111121",
  "11111111"
];
const T_WALL = [
  "33333333",
  "34444443",
  "34444443",
  "33333333",
  "44344443",
  "44344443",
  "44344443",
  "33333333"
];
const T_GRASS = [
  "11111111",
  "11151111",
  "11565111",
  "15666511",
  "11565111",
  "11151511",
  "11115651",
  "11111111"
];
const T_MARK = [
  "11111111",
  "17111171",
  "11711711",
  "11177111",
  "11177111",
  "11711711",
  "17111171",
  "11111111"
];
const bgTilesSrc = [T_FLOOR, T_WALL, T_GRASS, T_MARK];
const bgTiles = bgTilesSrc.flatMap(tile4bpp);

// ---- 64x64 tilemap ----------------------------------------------------
const MAP_W = 64;
const MAP_H = 64;
const isWall = (x, y) =>
  x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1 || // border
  (y === 36 && x >= 26 && x <= 40); // interior wall for the M4c collision demo

function tileAt(x, y) {
  if (isWall(x, y)) return 1;
  if (
    (x === 4 && y === 4) ||
    (x === MAP_W - 5 && y === 4) ||
    (x === 4 && y === MAP_H - 5) ||
    (x === MAP_W - 5 && y === MAP_H - 5) ||
    (x === MAP_W / 2 && y === MAP_H / 2)
  ) {
    return 3; // corner + centre markers
  }
  if ((x * 7 + y * 13) % 17 === 0) return 2; // scattered grass
  return 0; // floor
}
// SNES SC_64x64 VRAM layout: four 32x32 screens in order TL, TR, BL, BR.
const map = [];
for (const [bx, by] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
  for (let ly = 0; ly < 32; ly++) {
    for (let lx = 0; lx < 32; lx++) {
      const t = tileAt(bx * 32 + lx, by * 32 + ly);
      map.push(t & 0xff, (t >> 8) & 0xff); // entry = tile num, palette 0
    }
  }
}

// Collision bitmap: 1 bit per tile, row-major, set = solid. Every wall tile.
const collision = [];
for (let i = 0; i < (MAP_W * MAP_H + 7) >> 3; i++) collision.push(0);
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    if (isWall(x, y)) {
      const idx = y * MAP_W + x;
      collision[idx >> 3] |= 1 << (idx & 7);
    }
  }
}

// ---- fixed engine assets (font, placeholder sprite, emotes) ----------
// Shared with the real compiler (src/lib/compiler/snesFixedAssets.js).
const { snesFixedAssets } = require(path.resolve(
  __dirname,
  "../../../../src/lib/compiler/snesFixedAssets"
));

// ---- M5 / M5b: dialogue + menu strings -------------------------------
// $NN$ substitutes script_variables[NN] (0-99). \n is a line break.
// For CHOICE/MENU the string is the options, one per line.
const uiStrings = [
  "You have $00$ coins,\nbrave hero.", // 0
  "The camera panned\nover to this spot.", // 1
  "Scene two.\nThe screen faded here.", // 2
  "Yes\nNo",                          // 3  CHOICE options
  "You are brave!",                   // 4
  "Maybe next time.",                 // 5
  "One\nTwo\nThree\nFour\nFive",      // 6  MENU options (M5e: 2-column layout)
  "You picked $07$."                  // 7
];
function strBytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  out.push(0);
  return out;
}

// ---- M4b / M4c test scripts ------------------------------------------
// Opcodes from src/lib/events/scriptCommands.js.
// Scene 0 start (player spawns at tile 10,20):
//   var0 = 5              marks the script started
//   WAIT 30              blocking op - the VM must pause then resume
//   var1 = 6              set only after the wait (proves resume)
//   ACTOR_MOVE_TO (32,45) NOCLIP scripted walk, crosses the wall at row 36
//   LOAD_VECTORS/GET_POSITION  -> var2 = final tile x, var3 = final tile y
//   IF_ACTOR_AT_POSITION (32,45)  -> var4 = 1 on arrival, else 9
// Afterwards the player is d-pad controllable and blocked walking back up
// into the wall at (26..40, 36).
// event_ptrs[] index for each script (declared below the scripts that use them)
const EV_SCENE0 = 0;
const EV_NPC = 1;
const EV_SCENE1 = 2;
const EV_TRIG_A = 3;
const EV_TRIG_B = 4;
const EV_INPUT_HANDLER = 5;
const EV_TIMER_HANDLER = 6;

// M8 phase 1: MUSIC_PLAY track 0 (no loop flag wired yet) right at boot, so
// the test track starts automatically - no input choreography needed to hear
// it. M7-cont.: input/timer script opcodes, appended after the M4c arrival
// check. SET_INPUT_SCRIPT (Start -> scriptInputHandler), SET_TIMER_SCRIPT
// (~0.5s -> scriptTimerHandler, auto-repeats once this script reaches END),
// IF_INPUT (branches on A currently held, var13 = 1 / 9), AWAIT_INPUT
// (blocks on B) then var12 = 1 to prove it unblocked.
const scriptScene0 = [
  0x1e, 0, 0,                  //  0  MUSIC_PLAY track 0, loop=0
  0x24, 0x00, 0x00, 5,        //  3  SET var0 = 5
  0x0b, 30,                   //  7  WAIT 30
  0x24, 0x00, 0x01, 6,        //  9  SET var1 = 6
  0x10, 32, 45,               // 13  ACTOR_MOVE_TO (32, 45)
  0x41, 0x00, 0x02, 0x00, 0x03, // 16  LOAD_VECTORS varX=2, varY=3
  0x30,                       // 21  ACTOR_GET_POSITION -> var2, var3
  0x29, 32, 45, 0x00, 0x20,   // 22  IF_ACTOR_AT_POSITION (32,45) -> off 32
  0x24, 0x00, 0x04, 9,        // 27  SET var4 = 9   (not arrived)
  0x00,                       // 31  END
  0x24, 0x00, 0x04, 1,        // 32  SET var4 = 1   (arrived)
  0x4c, 0x80, 0x00, 0x00, EV_INPUT_HANDLER, // 36 SET_INPUT_SCRIPT Start -> EV_INPUT_HANDLER
  0x58, 2, 0x00, 0x00, EV_TIMER_HANDLER,    // 41 SET_TIMER_SCRIPT 2 ticks (~0.5s) -> EV_TIMER_HANDLER
  0x26, 0x10, 0x00, 57,        // 46 IF_INPUT mask=A(0x10) -> off 57
  0x24, 0x00, 0x0d, 9,         // 50 SET var13 = 9  (A not held)
  0x02, 0x00, 61,              // 54 JUMP -> off 61
  0x24, 0x00, 0x0d, 1,         // 57 SET var13 = 1  (A held)
  0x1d, 0x20,                  // 61 AWAIT_INPUT mask=B(0x20)
  0x24, 0x00, 0x0c, 1,         // 63 SET var12 = 1  (proves AWAIT_INPUT unblocked)
  // M7-cont.: SRAM save/load roundtrip. var16: no save yet (9) / exists (1,
  // shouldn't happen). var17: after SAVE_DATA, no save (9, shouldn't happen)
  // / exists (1, correct). var18: after CLEAR_DATA, no save (9, correct) /
  // exists (1, shouldn't happen). var19: set to 42, saved, dirtied to 0,
  // then LOAD_DATA restores it (and reloads the scene) - should read back 42.
  0x2d, 0x00, 77,               // 67 IF_SAVED_DATA -> off 77
  0x24, 0x00, 0x10, 9,          // 70 SET var16 = 9  (no save yet)
  0x02, 0x00, 81,               // 74 JUMP -> off 81
  0x24, 0x00, 0x10, 1,          // 77 SET var16 = 1  (save exists - unexpected)
  0x2b,                         // 81 SAVE_DATA
  0x2d, 0x00, 92,               // 82 IF_SAVED_DATA -> off 92
  0x24, 0x00, 0x11, 9,          // 85 SET var17 = 9  (no save - unexpected)
  0x02, 0x00, 96,               // 89 JUMP -> off 96
  0x24, 0x00, 0x11, 1,          // 92 SET var17 = 1  (save exists, correct)
  0x2c,                         // 96 CLEAR_DATA
  0x2d, 0x00, 107,              // 97 IF_SAVED_DATA -> off 107
  0x24, 0x00, 0x12, 9,          // 100 SET var18 = 9  (no save, correct)
  0x02, 0x00, 111,              // 104 JUMP -> off 111
  0x24, 0x00, 0x12, 1,          // 107 SET var18 = 1  (save exists - unexpected)
  0x24, 0x00, 0x13, 42,         // 111 SET var19 = 42
  0x2b,                         // 115 SAVE_DATA (captures var19=42 + current scene/pos/dir)
  0x24, 0x00, 0x13, 0,          // 116 SET var19 = 0  (dirty it locally)
  0x2a,                         // 120 LOAD_DATA (ends the script here; restores var19, reloads scene)
  0x00                          // 121 END (unreachable)
];
// M5b/c/d/e: emote, a 5-option 2-column MENU, report the pick, then an
// overlay that slides from the bottom third up to near the top and back off.
// M7-cont.: HIDE_SPRITES / SHOW_SPRITES bracket the top - the wandering NPC
// (and the player) should vanish from OAM for ~1/3s then come back. Then
// ACTOR_PUSH shoves the (already-active) player 2 tiles in the direction
// they're currently facing (down, having just walked into this trigger).
const scriptTrigA = [
  0x12,                             //  0  HIDE_SPRITES
  0x0b, 20,                         //  1  WAIT 20
  0x11,                             //  3  SHOW_SPRITES
  0x24, 0x00, 0x09, 1,             //  4  SET var9 = 1
  0x08, 0x00,                      //  8  ACTOR_SET_ACTIVE 0 (player)
  0x28, 0,                         // 10  ACTOR_PUSH continuous=0 (2 tiles)
  0x16, 0x02,                      // 12  ACTOR_EMOTE 2
  0x5c, 0x00, 0x07, 0, 0x00, 0x06, 1, 2, // 14  MENU var7, string 6, layout=1 (2-col), B cancels
  0x01, 0x00, 0x00, 0x07,          // 22  TEXT string 7 ("You picked $07$.")
  0x19, 0x00, 0x00, 24,            // 26  OVERLAY_SHOW colour 0, from row 24
  0x0b, 30,                        // 30  WAIT 30
  0x1c, 0x00, 8, 2,                // 32  OVERLAY_MOVE_TO row 8, speed 2
  0x0b, 30,                        // 36  WAIT 30
  0x1a,                            // 38  OVERLAY_HIDE
  0x45,                            // 39  SCENE_PUSH_STATE (saves scene 0 + current tile pos)
  0x24, 0x00, 0x0e, 1,             // 40  SET var14 = 1 (proves push completed)
  0x46, 1,                         // 44  SCENE_POP_STATE speed=1 (ends the script here)
  0x00                             // 46  END (unreachable - kept for consistency)
];
// M5b/M5d: NPC asks a yes/no CHOICE; the "yes" line comes with an avatar.
const scriptNpc = [
  0x24, 0x00, 0x05, 42,            //  0  SET var5 = 42
  0x27, 0x00, 0x06, 0, 0x00, 0x03, //  4  CHOICE var6, string 3
  0x03, 0x00, 0x06, 0x00, 20,      // 10  IF_TRUE var6 -> off 20
  0x01, 0x00, 0x00, 0x05,          // 15  TEXT string 5 (No)
  0x00,                            // 19  END
  0x5b, 0x00, 0x00, 0x04, 0x00,    // 20  TEXT_WITH_AVATAR string 4, avatar 0 (Yes)
  0x00                             // 25  END
];
// M5: scene 1 start - fade back in, then a line of text.
const scriptScene1 = [
  0x0d, 2,                   // FADE_IN speed 2
  0x01, 0x00, 0x00, 0x02,    // TEXT string 2
  0x00                       // END
];
// M5: fade out, then switch to scene 1 (the real converted background).
const scriptTrigB = [
  0x0c, 2,                        // FADE_OUT speed 2
  0x0e, 0x00, 0x01, 10, 9, 1, 2,  // SWITCH_SCENE(scene 1, tile 10,9, dir down, fade 2)
  0x00
];
// M7-cont.: targets of SET_INPUT_SCRIPT / SET_TIMER_SCRIPT above.
const scriptInputHandler = [
  0x24, 0x00, 0x0a, 1,  // SET var10 = 1
  0x00                  // END
];
const scriptTimerHandler = [
  0x24, 0x00, 0x0b, 1,  // SET var11 = 1
  0x00                  // END
];

// MOVEMENT_TYPE (gbs_types.h): 1 none, 2 player, 3 random-face, 5 random-walk
const MOVE_AI_RANDOM_WALK = 5;

// ---- scene data blobs ----------------------------------------------
// header:  [bg_index, num_actors, num_triggers, scene_script_idx, width, height]
// actor:   [tile_x, tile_y, dir, movement_type, sprite_idx, script_idx,
//           sprite_type(0 static/1 actor/2 actor-animated), anim_speed, animate] (9)
// trigger: [tile_x, tile_y, w, h, type(0=walk,1=action), script_idx]     (6)
// then the collision bitmap: ceil(width*height/8) bytes
const SPRITE_STATIC = 0;
// [24] per-scene OBJ slot table: sprite_type[8], sprite_frames[8], sprite_pal[8]
// (compileSnesData.js). Dummy: slot 0 static, palettes 0/3..7.
const dummySprSlots = [].concat(
  [SPRITE_STATIC, 0, 0, 0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],
  [0, 3, 4, 5, 6, 7, 0, 0]
);
const scene0 = [
  0, 1, 2, EV_SCENE0, MAP_W, MAP_H, // bg 0 = the 64x64 dummy map
  ...dummySprSlots,
  18, 24, 8, MOVE_AI_RANDOM_WALK, 0, EV_NPC, SPRITE_STATIC, 3, 0, // wandering NPC (off the walk path)
  32, 47, 2, 2, 0, EV_TRIG_A,      // walk trigger 2 tiles below the move target
  50, 50, 4, 4, 0, EV_TRIG_B,      // walk trigger -> scene 1
  ...collision
];
// scene 1 = bg 1 (mabe_house, 20x18), open floor, one line of text on entry.
const SCENE1_W = 20, SCENE1_H = 18;
const scene1Collision = new Array((SCENE1_W * SCENE1_H + 7) >> 3).fill(0);
const scene1 = [1, 0, 0, EV_SCENE1, SCENE1_W, SCENE1_H, ...dummySprSlots, ...scene1Collision];

// ---- emit -------------------------------------------------------------
function cArray(name, bytes, type = "unsigned char") {
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push("    " + bytes.slice(i, i + 16).join(", "));
  }
  return `const ${type} ${name}[${bytes.length}] = {\n${lines.join(",\n")}\n};\n`;
}

const bgPal0 = palBytes(bgPalette);

// This file lives at appData/src/snes/tools/ ; write next door into src/
const repoSrc = path.resolve(__dirname, "..", "src");

(async () => {
  const fixed = await snesFixedAssets();
  const uiFont = fixed.uiFont;
  const uiPal = fixed.uiPaletteBytes;
  const sprSheet = fixed.spriteTiles;
  const emotePal = fixed.emotePaletteBytes;
  const UI_FILL_TILE = fixed.UI_FILL_TILE;
  const NUM_UI_GLYPHS = fixed.NUM_UI_GLYPHS;
  const UI_FRAME_TILE0 = fixed.UI_FRAME_TILE0;
  const UI_CURSOR_TILE = fixed.UI_CURSOR_TILE;

  // scene_spr_pal_N is the whole OBJ CGRAM image (8 palettes * 32 bytes) for a
  // scene: palette 0 = placeholder, 1 = emotes, 2 = avatar 0, 3..7 = per-sprite.
  // The real compiler (compileSnesData.js) fills the rest per scene.
  const sprPal = new Array(8 * 32).fill(0);
  const putPal = (n, bytes) =>
    bytes.slice(0, 32).forEach((b, i) => {
      sprPal[n * 32 + i] = b;
    });
  putPal(0, fixed.spritePaletteBytes);
  putPal(1, emotePal);
  putPal(2, fixed.spritePaletteBytes); // avatar 0 = the placeholder

  // dummy: reuse the placeholder sprite (slot 0) as avatar 0 (fixed.AVATAR_SLOT0)
  {
    const s = fixed.AVATAR_SLOT0;
    const dst = [2 * s, 2 * s + 1, 16 + 2 * s, 17 + 2 * s];
    const src = [0, 1, 16, 17];
    dst.forEach((d, i) => {
      for (let b = 0; b < 32; b++) sprSheet[d * 32 + b] = sprSheet[src[i] * 32 + b];
    });
  }

  // ---- bg 1: a real GB Studio background through the M6 converter --------
  const real = await imageToBGData(MABE_PNG); // { tiles, tilemap, paletteBytes, tileW, tileH }
  if (real.warnings.length) console.warn(real.warnings.join("\n"));
  // pad the tileW-wide tilemap out to a 32-wide SC_32x32 map (bytes, LE)
  const realMap = [];
  for (let ty = 0; ty < 32; ty++) {
    for (let tx = 0; tx < 32; tx++) {
      const e =
        ty < real.tileH && tx < real.tileW
          ? real.tilemap[ty * real.tileW + tx]
          : 0;
      realMap.push(e & 0xff, (e >> 8) & 0xff);
    }
  }
  const realTiles = [].concat(...real.tiles);

  // ---- per-scene BG table ---------------------------------------------
  const bgs = [
    { name: "bg0", tiles: bgTiles, map, pal: bgPal0, w: MAP_W, h: MAP_H },
    {
      name: "bg1",
      tiles: realTiles,
      map: realMap,
      pal: real.paletteBytes,
      w: real.tileW,
      h: real.tileH
    }
  ];

  const h = `#ifndef ASSETS_H
#define ASSETS_H

/* Generated by appData/src/snes/tools/gen-dummy-gfx.js. Do not edit. */
#include "gbs_types.h"

extern const unsigned char scene_spr_0[${sprSheet.length}];
extern const unsigned char *const scene_spr_ptrs[2];
extern const unsigned char *const scene_spr_pal_ptrs[2];
extern const unsigned char *const scene_sprite_slot_ptrs[2];
extern const unsigned char ui_font[${uiFont.length}];
extern const unsigned char ui_pal[${uiPal.length}];

extern const unsigned char *const bg_tiles_ptrs[${bgs.length}];
extern const unsigned char *const bg_maps_ptrs[${bgs.length}];
extern const unsigned char *const bg_pals_ptrs[${bgs.length}];
extern const unsigned short bg_tiles_len[${bgs.length}];
extern const unsigned short bg_maps_len[${bgs.length}];
extern const unsigned short bg_pals_len[${bgs.length}];
extern const unsigned char bg_map_w[${bgs.length}];
extern const unsigned char bg_map_h[${bgs.length}];

extern const BANK_PTR event_ptrs[];
extern const BANK_PTR string_ptrs[];
extern const unsigned char *const scenes[];

#define NUM_SCENES 2
#define NUM_BGS ${bgs.length}
#define NUM_SPRITE_SHEETS 1
#define SPRITE_SLOTS 8
#define SPR_TILES_SIZE ${sprSheet.length}
#define SPR_PAL_SIZE   ${sprPal.length}
#define UI_FONT_SIZE  ${uiFont.length}
#define UI_PAL_SIZE   ${uiPal.length}
#define NUM_UI_GLYPHS ${NUM_UI_GLYPHS}
#define UI_FILL_TILE  ${UI_FILL_TILE}
#define UI_FRAME_TILE0 ${UI_FRAME_TILE0}
#define UI_CURSOR_TILE ${UI_CURSOR_TILE}
#define EMOTE_TILE0 ${fixed.EMOTE_TILE0}
#define NUM_EMOTES ${fixed.NUM_EMOTES}
#define AVATAR_TILE0 ${fixed.AVATAR_TILE0}
#define NUM_AVATARS 1
#define ACTOR_UP_TILE0 ${fixed.ACTOR_UP_TILE0}
#define ACTOR_SIDE_TILE0 ${fixed.ACTOR_SIDE_TILE0}
#define ACTOR_DOWN_B_TILE0 ${fixed.ACTOR_DOWN_B_TILE0}
#define ACTOR_UP_B_TILE0 ${fixed.ACTOR_UP_B_TILE0}
#define ACTOR_SIDE_B_TILE0 ${fixed.ACTOR_SIDE_B_TILE0}
#define NUM_STRINGS   ${uiStrings.length}
#define START_SCENE 0
#define START_X 10
#define START_Y 20
#define START_DIR 1
#define PLAYER_SPRITE_SLOT 0
#define PLAYER_SPRITE_TYPE 0
#define PLAYER_SPRITE_PAL 0
#define PLAYER_ANIM_SPEED 3
#define NUM_MUSIC_TRACKS 1

#endif
`;

  const bgArrays = bgs
    .map(
      b =>
        cArray(`${b.name}_tiles`, b.tiles) +
        cArray(`${b.name}_map`, b.map) +
        cArray(`${b.name}_pal`, b.pal)
    )
    .join("\n");

  // the 8 KB OBJ tile blob goes in assets_spr.asm (superfree section) - see
  // compileSnesData.js for why.
  const dbLines = a => {
    const out = [];
    for (let i = 0; i < a.length; i += 24)
      out.push(`.db ${a.slice(i, i + 24).map(b => b & 0xff).join(",")}`);
    return out.join("\n");
  };
  const assetsSpr = `;* Generated by appData/src/snes/tools/gen-dummy-gfx.js. Do not edit.
.include "hdr.asm"

.section "scene_spr_0" superfree
scene_spr_0:
${dbLines(sprSheet)}
.ends
`;

  const c = `/* Generated by appData/src/snes/tools/gen-dummy-gfx.js. Do not edit. */
#include "assets.h"

${cArray("scene_spr_pal_0", sprPal)}
${cArray("scene_spr_slot_0", [0])}
const unsigned char *const scene_spr_ptrs[2] = { scene_spr_0, scene_spr_0 };
const unsigned char *const scene_spr_pal_ptrs[2] = { scene_spr_pal_0, scene_spr_pal_0 };
const unsigned char *const scene_sprite_slot_ptrs[2] = { scene_spr_slot_0, scene_spr_slot_0 };
${cArray("ui_font", uiFont)}
${cArray("ui_pal", uiPal)}
${bgArrays}
const unsigned char *const bg_tiles_ptrs[${bgs.length}] = { ${bgs
    .map(b => `${b.name}_tiles`)
    .join(", ")} };
const unsigned char *const bg_maps_ptrs[${bgs.length}] = { ${bgs
    .map(b => `${b.name}_map`)
    .join(", ")} };
const unsigned char *const bg_pals_ptrs[${bgs.length}] = { ${bgs
    .map(b => `${b.name}_pal`)
    .join(", ")} };
const unsigned short bg_tiles_len[${bgs.length}] = { ${bgs
    .map(b => b.tiles.length)
    .join(", ")} };
const unsigned short bg_maps_len[${bgs.length}] = { ${bgs
    .map(b => b.map.length)
    .join(", ")} };
const unsigned short bg_pals_len[${bgs.length}] = { ${bgs
    .map(b => b.pal.length)
    .join(", ")} };
const unsigned char bg_map_w[${bgs.length}] = { ${bgs.map(b => b.w).join(", ")} };
const unsigned char bg_map_h[${bgs.length}] = { ${bgs.map(b => b.h).join(", ")} };

${cArray("script_scene0", scriptScene0)}
${cArray("script_npc", scriptNpc)}
${cArray("script_scene1", scriptScene1)}
${cArray("script_trig_a", scriptTrigA)}
${cArray("script_trig_b", scriptTrigB)}
${cArray("script_input_handler", scriptInputHandler)}
${cArray("script_timer_handler", scriptTimerHandler)}
const BANK_PTR event_ptrs[] = {
    { script_scene0 }, { script_npc }, { script_scene1 },
    { script_trig_a }, { script_trig_b },
    { script_input_handler }, { script_timer_handler }
};

${uiStrings.map((s, i) => cArray(`string_${i}`, strBytes(s))).join("\n")}
const BANK_PTR string_ptrs[] = {
${uiStrings.map((_, i) => `    { string_${i} }`).join(",\n")}
};

${cArray("scene_0", scene0)}
${cArray("scene_1", scene1)}
const unsigned char *const scenes[] = { scene_0, scene_1 };
`;

  fs.writeFileSync(path.join(repoSrc, "assets.h"), h);
  fs.writeFileSync(path.join(repoSrc, "assets.c"), c);
  fs.writeFileSync(path.join(repoSrc, "assets_spr.asm"), assetsSpr);
  console.log(
    `wrote assets.c (${c.length} bytes): bg0 ${MAP_W}x${MAP_H} dummy, ` +
      `bg1 ${real.tileW}x${real.tileH} mabe_house (${real.tileCount} tiles, ` +
      `${real.colorCount} colours), sprite, font, ${uiStrings.length} strings, 2 scenes`
  );
})();
