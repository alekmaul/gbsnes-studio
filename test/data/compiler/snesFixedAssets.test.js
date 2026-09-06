import Path from "path";
import { snesFixedAssets } from "../../../src/lib/compiler/snesFixedAssets";

const UI_DIR = Path.join(
  __dirname,
  "..",
  "..",
  "..",
  "appData",
  "templates",
  "gbhtml",
  "assets",
  "ui"
);

describe("snesFixedAssets - BG3 UI graphics", () => {
  test("builds the font + frame + cursor blob from the sample's ui PNGs", async () => {
    const a = await snesFixedAssets({ uiAssetDir: UI_DIR });

    // 224 glyphs + solid fill + 9 nine-slice frame + 1 cursor, 16 B/tile (2bpp)
    expect(a.NUM_UI_GLYPHS).toBe(224);
    expect(a.UI_FILL_TILE).toBe(224);
    expect(a.UI_FRAME_TILE0).toBe(225);
    expect(a.UI_CURSOR_TILE).toBe(234);
    expect(a.uiFont.length).toBe(235 * 16);

    // tile 0 (space / UI_BLANK) must be fully transparent - it is the tile every
    // BG3 cell outside the dialogue box holds
    expect(a.uiFont.slice(0, 16)).toEqual(new Array(16).fill(0));

    // the overlay fill tile is solid (every pixel colour 3)
    const fill = a.uiFont.slice(224 * 16, 225 * 16);
    expect(fill).toEqual(new Array(16).fill(0xff));

    // a real glyph is not blank
    const glyphA = a.uiFont.slice(33 * 16, 34 * 16); // 'A' = 0x41 - 0x20
    expect(glyphA.some(b => b !== 0)).toBe(true);

    // 4-colour BG3 palette (8 bytes), entry 0 unused/black
    expect(a.uiPaletteBytes.length).toBe(8);
    expect(a.uiPaletteBytes.slice(0, 2)).toEqual([0, 0]);
  });

  test("defaults to the stock sample ui dir when none is given", async () => {
    const a = await snesFixedAssets();
    expect(a.uiFont.length).toBe(235 * 16);
    expect(a.NUM_UI_GLYPHS).toBe(224);
  });
});
