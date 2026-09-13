/*
 * Game Boy (GBDK 2020) compile target.
 *
 * This is the single source of truth for every hardware-shaped constant the
 * compiler hard-codes. The values here are exactly the historical literals
 * from bankedData.js / compileData.js / compileImages.js / consts.js /
 * validation.ts / SceneInfo.js — changing any of them changes generated
 * output and breaks the byte-exact event tests, so don't.
 *
 * As of GB Studio 2.0.0-beta5, only bankedData.js and consts.js actually
 * import from this file (see below) - the rest of these values are recorded
 * here for the SNES target's benefit (targets/snes.js) and for whichever
 * later milestone makes the data compiler / editor genuinely target-aware,
 * matching how the v1.1.4 SNES port itself introduced this file (some fields
 * went unconsumed for several milestones after it existed).
 *
 * A few fields here have no v1.1.4 (GB Studio 1.2.2) equivalent at all -
 * 2.0.0-beta5's engine raised or added several per-scene limits outright
 * (maxActors 9->30, background size 256px->2040px, new maxActorsSmall /
 * maxOnscreenActors concepts). These are the real, current beta5 numbers,
 * not the old ones - see the MIGRATION_V2_AUDIT.md M3 notes.
 */
const gbTarget = {
  id: "gb",
  name: "Game Boy",
  romExt: "gb",
  // Folder under appData/src/<engineDir> copied by ejectBuild
  engineDir: "gb",

  // --- Banked data model (bankedData.js) ---
  // 16 KB banks; offset in BANK_PTR is a 0x4000-window address
  bankSize: 16384,
  // First data bank; banks 0..5 are engine/pointer tables
  minDataBank: 6,
  // GBDK supports at most 512 banks
  maxBanks: 512,
  // data_ptrs.c lives in this bank (compileData.js DATA_PTRS_BANK)
  dataPtrsBank: 5,
  // Reserved music banks appended after data (compileData.js NUM_MUSIC_BANKS)
  numMusicBanks: 30,
  // Start address of the switchable bank window (compileMusic.js)
  bankedMemoryStart: 0x4000,
  // MBC controllers and the banks MBC1 cannot address
  bankControllers: { mbc1: "MBC1", mbc5: "MBC5" },
  disallowedBanks: [0x20, 0x40, 0x60],

  // --- Screen geometry, in 8x8 tiles ---
  // 160x144 -> 20x18 (consts.js SCREEN_WIDTH/SCREEN_HEIGHT)
  screenTileWidth: 20,
  screenTileHeight: 18,
  // Shared/merged background tilesets must fit this many unique tiles
  // (compileImages.js / validation.ts: 16 * 12)
  maxTilesetTiles: 192,

  // --- Editor asset guidance (validation.ts getBackgroundInfo) ---
  // 2.0.0-beta5 raised this far past the old 256x256/32x32-tile map cap -
  // backgrounds are no longer limited to one screen's worth of unique tiles
  // up front (that's what maxTilesetTiles above still enforces).
  maxBackgroundWidth: 2040,
  maxBackgroundHeight: 2040,
  // New in 2.0.0-beta5: a combined width*height budget independent of the
  // two per-axis caps above (validation.ts MAX_PIXELS).
  maxBackgroundPixels: 16380 * 64,

  // --- Per-scene entity limits (consts.js / compileData.js) ---
  maxActors: 30,
  // A scene no larger than one screen (screenTileWidth x screenTileHeight)
  // gets a lower actor cap than a larger, scrolling one (SceneInfo.js) - new
  // in 2.0.0-beta5, no v1.1.4 equivalent.
  maxActorsSmall: 10,
  maxTriggers: 30,
  // GB VRAM shared between BG and OBJ: budget of 16x16 sprite frames per
  // scene (consts.js MAX_FRAMES / components/world/SceneInfo.js). SNES has
  // no equivalent (fixed OBJ sheet, see maxSpriteSheets on targets/snes.js).
  maxSpriteFrames: 25,
  maxSpriteSheets: null,
  // How many actors can be near the player/camera at once before
  // SceneInfo.js warns (consts.js MAX_ONSCREEN) - new in 2.0.0-beta5.
  maxOnscreenActors: 10,

  // A single compiled script must fit one bank (compileEntityEvents.js)
  maxScriptSize: 16384,

  // Width of the button mask the input opcodes (IF_INPUT / AWAIT_INPUT /
  // SET_INPUT_SCRIPT / REMOVE_INPUT_SCRIPT) carry (compiler/helpers.js
  // KEY_BITS). The Game Boy has 8 buttons - one byte, all bits used.
  inputMaskBytes: 1,

  // Dialogue box text wrap width, in characters (eventTextDialogue.js's
  // editor pre-wrap, mirroring the GB engine's own box column count). Not
  // yet wired to this descriptor (eventTextDialogue.js has no target
  // context to read it from) - historical literals, unchanged from v1.1.4.
  maxTextLineChars: 18,
  maxTextLineCharsWithAvatar: 16,
};

export default gbTarget;
