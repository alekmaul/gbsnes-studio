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
    expect(snes.maxTextTotalChars).toBe(78);
    expect(snes.maxTextTotalCharsWithAvatar).toBe(69);
  });
});
