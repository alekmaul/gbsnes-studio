import { getTarget, gb, snes, TARGET_IDS } from "../../../src/lib/compiler/targets";
import {
  GB_MAX_BANK_SIZE,
  MIN_DATA_BANK,
  MAX_BANKS,
  MBC1,
  MBC5,
} from "../../../src/lib/compiler/bankedData";
import {
  MAX_ACTORS,
  MAX_ACTORS_SMALL,
  MAX_TRIGGERS,
  MAX_FRAMES,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  MAX_ONSCREEN,
} from "../../../src/consts";

describe("compile targets", () => {
  test("getTarget resolves ids and falls back to gb", () => {
    expect(getTarget("gb")).toBe(gb);
    expect(getTarget("snes")).toBe(snes);
    expect(getTarget()).toBe(gb);
    expect(getTarget("nope")).toBe(gb);
    expect(TARGET_IDS).toEqual(expect.arrayContaining(["gb", "snes"]));
  });

  // These are the historical hard-coded literals. If the gb descriptor
  // drifts from them, generated ROM data changes and the event byte-tests
  // break.
  test("gb descriptor keeps the current Game Boy Studio 2.0.0-beta5 constants", () => {
    expect(gb.bankSize).toBe(16384);
    expect(gb.minDataBank).toBe(6);
    expect(gb.maxBanks).toBe(512);
    expect(gb.dataPtrsBank).toBe(5);
    expect(gb.numMusicBanks).toBe(30);
    expect(gb.bankedMemoryStart).toBe(0x4000);
    expect(gb.bankControllers).toEqual({ mbc1: "MBC1", mbc5: "MBC5" });
    expect(gb.disallowedBanks).toEqual([0x20, 0x40, 0x60]);
    expect(gb.screenTileWidth).toBe(20);
    expect(gb.screenTileHeight).toBe(18);
    expect(gb.maxTilesetTiles).toBe(16 * 12);
    expect(gb.maxActors).toBe(30);
    expect(gb.maxActorsSmall).toBe(10);
    expect(gb.maxTriggers).toBe(30);
    expect(gb.maxScriptSize).toBe(16384);
    expect(gb.inputMaskBytes).toBe(1);
    expect(gb.romExt).toBe("gb");
    expect(gb.engineDir).toBe("gb");
    // editor asset guidance
    expect(gb.maxBackgroundWidth).toBe(2040);
    expect(gb.maxBackgroundHeight).toBe(2040);
    expect(gb.maxBackgroundPixels).toBe(16380 * 64);
    expect(gb.maxSpriteFrames).toBe(25);
    expect(gb.maxSpriteSheets).toBeNull();
    expect(gb.maxOnscreenActors).toBe(10);
    // dialogue box editor pre-wrap width (eventTextDialogue.js), historical literals
    expect(gb.maxTextLineChars).toBe(18);
    expect(gb.maxTextLineCharsWithAvatar).toBe(16);
  });

  test("bankedData and consts still expose the same Game Boy values", () => {
    expect(GB_MAX_BANK_SIZE).toBe(16384);
    expect(MIN_DATA_BANK).toBe(6);
    expect(MAX_BANKS).toBe(512);
    expect(MBC1).toBe("MBC1");
    expect(MBC5).toBe("MBC5");
    expect(MAX_ACTORS).toBe(30);
    expect(MAX_ACTORS_SMALL).toBe(10);
    expect(MAX_TRIGGERS).toBe(30);
    expect(MAX_FRAMES).toBe(25);
    expect(SCREEN_WIDTH).toBe(20);
    expect(SCREEN_HEIGHT).toBe(18);
    expect(MAX_ONSCREEN).toBe(10);
  });

  test("snes descriptor has the v1.1.4 M0 cadrage shape", () => {
    expect(snes.bankSize).toBe(32768);
    expect(snes.minDataBank).toBe(1);
    expect(snes.maxBanks).toBe(128);
    expect(snes.dataPtrsBank).toBeNull();
    expect(snes.numMusicBanks).toBe(0);
    expect(snes.bankedMemoryStart).toBe(0);
    expect(snes.bankControllers).toBeNull();
    expect(snes.disallowedBanks).toEqual([]);
    expect(snes.screenTileWidth).toBe(32);
    expect(snes.screenTileHeight).toBe(28);
    expect(snes.maxTilesetTiles).toBe(256);
    expect(snes.maxActors).toBe(9);
    expect(snes.maxTriggers).toBe(9);
    expect(snes.maxScriptSize).toBe(32768);
    expect(snes.inputMaskBytes).toBe(2);
    expect(snes.romExt).toBe("sfc");
    expect(snes.engineDir).toBe("snes");
    expect(snes.maxBackgroundWidth).toBe(256);
    expect(snes.maxBackgroundHeight).toBe(256);
    expect(snes.maxSpriteFrames).toBeNull();
    expect(snes.maxSpriteSheets).toBe(8);
    expect(snes.maxTextLineChars).toBe(27);
    expect(snes.maxTextLineCharsWithAvatar).toBe(23);
  });

  test("gb and snes screen geometry differ (used for camera clamps)", () => {
    expect(snes.screenTileWidth).toBeGreaterThan(gb.screenTileWidth);
    expect(snes.screenTileHeight).toBeGreaterThan(gb.screenTileHeight);
  });
});
