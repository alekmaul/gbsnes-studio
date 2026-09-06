import { backgroundWarnings } from "../../src/lib/helpers/assetWarnings";

const bg = (w, h) => ({ imageWidth: w, imageHeight: h });

describe("backgroundWarnings", () => {
  test("no warnings for a screen-to-map-sized background", () => {
    expect(backgroundWarnings(bg(160, 144), "gb")).toEqual([]);
    expect(backgroundWarnings(bg(256, 256), "gb")).toEqual([]);
    expect(backgroundWarnings(bg(256, 224), "snes")).toEqual([]);
    expect(backgroundWarnings(bg(256, 256), "snes")).toEqual([]);
  });

  test("GB screen size is too small for SNES", () => {
    // 160x144 is fine on GB...
    expect(backgroundWarnings(bg(160, 144), "gb")).toEqual([]);
    // ...but below the 256x224 SNES screen
    const w = backgroundWarnings(bg(160, 144), "snes");
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/256px x 224px/);
  });

  test("too large past the 32x32-tile map, either target", () => {
    expect(backgroundWarnings(bg(512, 512), "gb")[0]).toMatch(/256px x 256px/);
    expect(backgroundWarnings(bg(512, 512), "snes")[0]).toMatch(/256px x 256px/);
  });

  test("non-multiple-of-8 dimensions", () => {
    const w = backgroundWarnings(bg(200, 145), "gb");
    expect(w.some(x => /multiple of 8/i.test(x))).toBe(true);
  });

  test("unknown target falls back to gb bounds", () => {
    expect(backgroundWarnings(bg(160, 144), "nope")).toEqual([]);
  });

  test("null file -> no warnings", () => {
    expect(backgroundWarnings(null, "snes")).toEqual([]);
  });
});
