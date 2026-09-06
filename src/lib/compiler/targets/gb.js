/*
 * Game Boy (GBDK) compile target.
 *
 * This is the single source of truth for every hardware-shaped constant the
 * compiler used to hard-code. The values here are exactly the historical
 * literals from bankedData.js / compileData.js / compileImages.js /
 * scriptBuilder.js / consts.js — changing any of them changes generated
 * output and breaks the byte-exact event tests, so don't.
 *
 * The SNES target (targets/snes.js) provides the same shape with SNES values.
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
  // data_ptrs.c lives in this bank (compileData.js)
  dataPtrsBank: 5,
  // Reserved music banks appended after data (compileData.js / compileMusic.js)
  numMusicBanks: 30,
  // Start address of the switchable bank window (compileMusic.js)
  bankedMemoryStart: 0x4000,
  // MBC controllers and the banks MBC1 cannot address
  bankControllers: { mbc1: "MBC1", mbc5: "MBC5" },
  disallowedBanks: [0x20, 0x40, 0x60],

  // --- Screen geometry, in 8x8 tiles ---
  // 160x144 -> 20x18. Used as `scene.width - screenTileWidth` camera clamps.
  screenTileWidth: 20,
  screenTileHeight: 18,
  // Shared/merged background tilesets must fit this many unique tiles
  // (compileImages.js: 16 * 12)
  maxTilesetTiles: 192,

  // --- Editor asset guidance (components/assets/ImageViewer.js) ---
  // A background must be at least the screen and at most the 32x32-tile map.
  maxBackgroundWidth: 256,
  maxBackgroundHeight: 256,

  // --- Per-scene entity limits (consts.js / compileData.js) ---
  maxActors: 9,
  maxTriggers: 9,
  // GB VRAM shared between BG and OBJ: budget of 16x16 sprite frames per scene
  // (components/world/Scene.js). SNES has no equivalent (fixed OBJ sheet).
  maxSpriteFrames: 25,
  maxSpriteSheets: null,

  // A single compiled script must fit one bank (compileEntityEvents.js)
  maxScriptSize: 16384,

  // Width of the button mask the input opcodes (IF_INPUT / AWAIT_INPUT /
  // SET_INPUT_SCRIPT / REMOVE_INPUT_SCRIPT) carry. The Game Boy has 8 buttons —
  // one byte, all bits used. scriptBuilder.js reads this to know how many bytes
  // to emit for a mask; the GB engine's script_cmds table must stay in sync.
  inputMaskBytes: 1
};

export default gbTarget;
