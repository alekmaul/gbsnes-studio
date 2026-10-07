import snes from "../../../src/lib/compiler/targets";

describe("compile targets", () => {
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
    // v4: raised 256->1024 (user-asked, after unifying the VRAM map freed
    // 0x2000-0x5FFF for BG1 graphics) - 1024 is also the real hardware
    // ceiling (the tilemap's own 10-bit tile-index field), not just a
    // VRAM-budget choice anymore.
    expect(snes.maxTilesetTiles).toBe(1024);
    // v4: raised from 9/9 to match GB Studio 3.2.1 exactly (a stale
    // placeholder, not a real engine ceiling) - gbs_types.h's MAX_ACTORS/
    // MAX_TRIGGERS were raised to match.
    expect(snes.maxActors).toBe(19);
    expect(snes.maxTriggers).toBe(30);
    expect(snes.maxActorsSmall).toBe(10);
    expect(snes.maxScriptSize).toBe(32768);
    expect(snes.inputMaskBytes).toBe(2);
    expect(snes.romExt).toBe("sfc");
    expect(snes.engineDir).toBe("snes");
    // v4: raised from 256 to match the engine's real 64x64-tile capacity
    // (SC_64x64, present since the first SNES commit), then width raised
    // again to 2040 (255 tiles) to match real horizontal background
    // streaming - width and height have different real ceilings now, see
    // targets/snes.js's own comment for the full reasoning.
    expect(snes.maxBackgroundWidth).toBe(2040);
    expect(snes.maxBackgroundHeight).toBe(512);
    expect(snes.maxSpriteFrames).toBeNull();
    expect(snes.maxSpriteSheets).toBe(8);
    expect(snes.maxTextLineChars).toBe(27);
    expect(snes.maxTextLineCharsWithAvatar).toBe(23);
    expect(snes.maxTextTotalChars).toBe(78);
    expect(snes.maxTextTotalCharsWithAvatar).toBe(69);
  });
});
