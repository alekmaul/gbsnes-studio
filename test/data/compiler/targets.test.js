import { getTarget, gb, snes, TARGET_IDS } from "../../../src/lib/compiler/targets";
import {
  GB_MAX_BANK_SIZE,
  MIN_DATA_BANK,
  MAX_BANKS,
  MBC1,
  MBC5
} from "../../../src/lib/compiler/bankedData";
import { MAX_ACTORS, MAX_TRIGGERS } from "../../../src/consts";

describe("compile targets", () => {
  test("getTarget resolves ids and falls back to gb", () => {
    expect(getTarget("gb")).toBe(gb);
    expect(getTarget("snes")).toBe(snes);
    expect(getTarget()).toBe(gb);
    expect(getTarget("nope")).toBe(gb);
    expect(TARGET_IDS).toEqual(expect.arrayContaining(["gb", "snes"]));
  });

  // These are the historical hard-coded literals. If the gb descriptor drifts
  // from them, generated ROM data changes and the event byte-tests break.
  test("gb descriptor keeps the historical Game Boy constants", () => {
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
    expect(gb.maxActors).toBe(9);
    expect(gb.maxTriggers).toBe(9);
    expect(gb.maxScriptSize).toBe(16384);
    expect(gb.romExt).toBe("gb");
    expect(gb.engineDir).toBe("gb");
    // editor asset guidance
    expect(gb.maxBackgroundWidth).toBe(256);
    expect(gb.maxBackgroundHeight).toBe(256);
    expect(gb.maxSpriteFrames).toBe(25);
    expect(gb.maxSpriteSheets).toBeNull();
  });

  test("bankedData and consts still expose the same Game Boy values", () => {
    expect(GB_MAX_BANK_SIZE).toBe(16384);
    expect(MIN_DATA_BANK).toBe(6);
    expect(MAX_BANKS).toBe(512);
    expect(MBC1).toBe("MBC1");
    expect(MBC5).toBe("MBC5");
    expect(MAX_ACTORS).toBe(9);
    expect(MAX_TRIGGERS).toBe(9);
  });

  test("snes descriptor has the M0 cadrage shape", () => {
    expect(snes.romExt).toBe("sfc");
    expect(snes.engineDir).toBe("snes");
    expect(snes.bankSize).toBe(32768);
    expect(snes.bankedMemoryStart).toBe(0);
    expect(snes.bankControllers).toBeNull();
    expect(snes.screenTileWidth).toBe(32);
    expect(snes.screenTileHeight).toBe(28);
    // M6: BG tile budget is the real VRAM window (0x1000 words / 16 per 4bpp tile)
    expect(snes.maxTilesetTiles).toBe(256);
    // M9 editor: SNES is limited by distinct sprite sheets, not a frame budget
    expect(snes.maxSpriteFrames).toBeNull();
    expect(snes.maxSpriteSheets).toBe(8);
    // every gb key exists on snes so nothing reads `undefined`
    Object.keys(gb).forEach(key => {
      expect(snes).toHaveProperty(key);
    });
  });
});
