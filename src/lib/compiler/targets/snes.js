/*
 * SNES (PVSnesLib) compile target.
 *
 * Same shape as targets/gb.js. Values are carried forward from the v1.1.4
 * SNES port's own target descriptor (see the M0 cadrage decisions D1-D5,
 * still accurate - the appData/src/snes/ engine and compileSnesData.js
 * haven't been rebuilt yet on this v2 branch, so nothing about the SNES
 * side's own hardware/format constraints has actually changed):
 *   D1  Mode 1, one 16x16 OAM sprite per actor
 *   D2  256x224 -> 32x28 visible tiles
 *   D3  LoROM + FastROM, SRAM 8 KB, output game.sfc
 *   D4  one BankedData bank -> one `.SECTION SUPERFREE` (<=32 KB);
 *       BANK_PTR offset is a 0-based section offset (no 0x4000 window),
 *       reads are direct far dereferences (no bank switching)
 *   D5  explicit palettes; the tileset limit is really a VRAM budget
 *
 * Consumed by compileSnesData.js (M7) and scriptBuilder.js's SNES-aware
 * paths (input mask width, overlay row scaling, camera clamp). This file
 * existed since M3, before any of that code did, so work had a target
 * descriptor to plug into from the start, matching how targets/gb.js works.
 *
 * A few fields are left as the *old* v1.1.4 values on purpose, flagged
 * below: M5 (all 5 genres) landed without changing the scene/actor blob's
 * *entity-count* format (MAX_ACTORS/MAX_TRIGGERS are still 9/9 in
 * gbs_types.h - M5 was genre dispatch + movement, not an entity-count
 * increase), so there is still no rebuilt format to derive a new number
 * from. Revisit if/when the entity-count ceiling itself is ever raised.
 */
const snesTarget = {
  id: "snes",
  name: "Super Nintendo",
  romExt: "sfc",
  engineDir: "snes",

  // --- Banked data model (M7) ---
  // LoROM bank window is 32 KB; a SUPERFREE section fits wholly in one bank
  bankSize: 32768,
  // First data section bank (bank 0 holds crt0 + engine)
  minDataBank: 1,
  // 128 LoROM banks up to 4 MB
  maxBanks: 128,
  // Far pointer table, no dedicated pointer bank
  dataPtrsBank: null,
  // snesmod places its own SPC data (M8)
  numMusicBanks: 0,
  // D4: section offsets are 0-based
  bankedMemoryStart: 0,
  // No MBC on SNES
  bankControllers: null,
  disallowedBanks: [],

  // --- Screen geometry, in 8x8 tiles (D2) ---
  screenTileWidth: 32,
  screenTileHeight: 28,

  // --- Editor asset guidance ---
  // compileSnesData.js (v1.1.4) caps a scene background at 32x32 tiles;
  // unrelated to GB Studio 2.0's own much larger 2040px/maxBackgroundPixels
  // limits (targets/gb.js) - those are a GB-only validation.ts concept with
  // no SNES equivalent yet.
  maxBackgroundWidth: 256,
  maxBackgroundHeight: 256,
  maxBackgroundPixels: null,
  // VRAM budget for one background layer's tiles (M6). v1.1.4 engine layout
  // (appData/src/snes/src/ui.c): BG1 map 0x0000-0x0FFF, BG3 UI map
  // 0x1000-0x17FF, BG1 tiles 0x2000-0x2FFF (0x1000 words), BG3 font 0x3000+.
  // A 4bpp tile is 16 words, so 0x1000 / 16 = 256 tiles.
  maxTilesetTiles: 256,

  // --- Per-scene entity limits ---
  // PROVISIONAL - carried forward unrevised from v1.1.4 (which itself never
  // revisited GB Studio 1.2.2's old 9/9 cap). GB Studio 2.0.0-beta5 raised
  // the Game Boy figure to 30 (see targets/gb.js) but that's driven by the
  // new genre-based engine's own scene/actor data layout, which the SNES
  // engine hasn't been rebuilt to match yet (M5). Revisit then.
  maxActors: 9,
  maxTriggers: 9,
  // No small/large-scene actor cap distinction exists on the SNES engine
  // (v1.1.4 or planned) - GB Studio 2.0.0-beta5-only concept so far.
  maxActorsSmall: null,
  // No per-scene sprite-frame budget (fixed 256-tile OBJ sheet); the real
  // limit is the number of distinct actor sprite sheets loaded at once
  // (compileSnesData.js SPRITE_SLOTS, v1.1.4). Shown in the scene info bar
  // for SNES.
  maxSpriteFrames: null,
  maxSpriteSheets: 8,
  // No v1.1.4 equivalent - the SNES's 128-sprite OAM budget is far larger
  // than the Game Boy's, this was never a practical scene-authoring
  // constraint worth warning about.
  maxOnscreenActors: null,

  // A compiled script must fit one SUPERFREE section
  maxScriptSize: 32768,

  // The SNES pad adds X / Y / L / R, so the input opcodes carry a 2-byte
  // mask (KEY_BITS bits 8..11, v1.1.4 compiler/helpers.js). The Game Boy
  // side (targets/gb.js inputMaskBytes: 1) is unchanged in 2.0.0-beta5, so
  // this is still a clean +1 byte, target-only difference.
  inputMaskBytes: 2,

  // Dialogue box text wrap width, in characters. Mirrors
  // appData/src/snes/src/ui.c's own runtime word-wrap (v1.1.4): TXT_COLS
  // (28) - 1, minus the avatar portrait's xoff (4 tiles) when one is shown.
  maxTextLineChars: 27,
  maxTextLineCharsWithAvatar: 23,
  // Combined character budget across all lines of one dialogue box (M9).
  // The SNES box is content-sized up to BOX_ROWS (8, appData/src/snes/src/
  // ui.c) rather than GB's fixed 4-line box, so there's no equivalent
  // runtime constant to derive this from directly - scaled proportionally
  // from GB Studio's own tuned totals (52/18, 48/16) by the wider line
  // count, same as maxTextLineChars itself was derived from TXT_COLS.
  maxTextTotalChars: 78,
  maxTextTotalCharsWithAvatar: 69,
};

export default snesTarget;
