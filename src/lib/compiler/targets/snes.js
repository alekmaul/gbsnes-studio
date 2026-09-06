/*
 * SNES (PVSnesLib) compile target.
 *
 * Same shape as targets/gb.js, with values from the M0 cadrage decisions:
 *   D1  Mode 1, one 16x16 OAM sprite per actor
 *   D2  256x224 -> 32x28 visible tiles
 *   D3  LoROM + FastROM, SRAM 8 KB, output game.sfc
 *   D4  one BankedData bank -> one `.SECTION SUPERFREE` (<=32 KB);
 *       BANK_PTR offset is a 0-based section offset (no 0x4000 window),
 *       reads are direct far dereferences (no bank switching)
 *   D5  explicit palettes; the tileset limit is really a VRAM budget
 *
 * Not all of this is consumed yet — the data compiler becomes target-aware in
 * milestones M6/M7. buildSnesRom.js already uses engineDir / romExt.
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
  // --- Editor asset guidance (components/assets/ImageViewer.js) ---
  // compileSnesData.js currently caps a scene background at 32x32 tiles.
  maxBackgroundWidth: 256,
  maxBackgroundHeight: 256,
  // VRAM budget for one background layer's tiles (M6). Current engine layout
  // (appData/src/snes/src/ui.c): BG1 map 0x0000-0x0FFF, BG3 UI map 0x1000-0x17FF,
  // BG1 tiles 0x2000-0x2FFF (0x1000 words), BG3 font 0x3000+. A 4bpp tile is
  // 16 words, so 0x1000 / 16 = 256 tiles. snesgfx.js de-dupes with H/V flips.
  maxTilesetTiles: 256,

  // --- Per-scene entity limits (unchanged for now, D1) ---
  maxActors: 9,
  maxTriggers: 9,
  // No per-scene sprite-frame budget (fixed 256-tile OBJ sheet); the real
  // limit is the number of distinct actor sprite sheets loaded at once
  // (compileSnesData.js SPRITE_SLOTS). Shown in the scene info bar for SNES.
  maxSpriteFrames: null,
  maxSpriteSheets: 8,

  // A compiled script must fit one SUPERFREE section
  maxScriptSize: 32768
};

export default snesTarget;
