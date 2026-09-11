import Path from "path";
import os from "os";
import fs from "fs-extra";
import { PNG } from "pngjs";
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

// Writes a flat RGB pixel grid (row-major [[r,g,b], ...]) to a PNG file, for
// building tiny synthetic ui/{ascii,frame,cursor}.png fixtures.
const writePng = (file, width, height, pixels) => {
  const png = new PNG({ width, height });
  pixels.forEach(([r, g, b], i) => {
    const idx = i << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = 255;
  });
  fs.writeFileSync(file, PNG.sync.write(png));
};

// Decodes a BG3 15-bit BGR555 palette word back to 8-bit r,g,b (5-bit
// components << 3, same rounding compileSnesData's callers rely on).
const wordToRgb8 = w => [(w & 31) << 3, ((w >> 5) & 31) << 3, ((w >> 10) & 31) << 3];

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

  // Regression: a single anti-aliased/resave-artefact pixel on frame.png or
  // cursor.png (both tiny) used to be able to bump a real, heavily-used
  // colour (the font's own ink colour) out of the 3-colour palette, because
  // the old code picked the palette's middle slot by luminance rank alone -
  // "2nd-lightest colour", not "2nd most common colour". User-found: ascii.png
  // rendered in-game with the wrong ink colour even though the PNG itself
  // only had its own 3 clean colours.
  test("a rare stray colour on frame/cursor can't displace the font's real ink colour", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-ui-stray-"));
    try {
      const LIGHT = [216, 228, 216]; // box interior - lightest
      const GOLD = [212, 168, 56]; // real, heavily-used ink colour
      const DARK = [28, 28, 60]; // outline - darkest
      const STRAY = [188, 168, 172]; // rare anti-aliasing artefact

      // 4x4: 8 light, 4 gold, 4 dark
      writePng(Path.join(dir, "ascii.png"), 4, 4, [
        LIGHT, LIGHT, GOLD, GOLD,
        GOLD, GOLD, DARK, DARK,
        LIGHT, LIGHT, LIGHT, LIGHT,
        DARK, DARK, LIGHT, LIGHT
      ]);
      // 2x2: 3 light + 1 stray pixel (the artefact)
      writePng(Path.join(dir, "frame.png"), 2, 2, [LIGHT, LIGHT, LIGHT, STRAY]);
      // 2x2: all dark
      writePng(Path.join(dir, "cursor.png"), 2, 2, [DARK, DARK, DARK, DARK]);
      // emotes.png is read from the same uiAssetDir now (see the "emote
      // bubble palette" describe block below) - unused by this test, just
      // needs to exist.
      fs.copySync(
        Path.join(UI_DIR, "emotes.png"),
        Path.join(dir, "emotes.png")
      );

      const a = await snesFixedAssets({ uiAssetDir: dir });
      const words = [];
      for (let i = 0; i < a.uiPaletteBytes.length; i += 2) {
        words.push(a.uiPaletteBytes[i] | (a.uiPaletteBytes[i + 1] << 8));
      }
      const rgb = words.map(wordToRgb8);

      // index 0 unused, 1 = lightest, 3 = darkest regardless of count
      expect(rgb[1]).toEqual([216, 224, 216]); // LIGHT, 5-bit rounded
      expect(rgb[3]).toEqual([24, 24, 56]); // DARK, 5-bit rounded
      // index 2 (the contested middle slot) must be the real ink colour
      // (4 pixels), not the 1-pixel stray artefact
      expect(rgb[2]).toEqual([208, 168, 56]); // GOLD, 5-bit rounded
    } finally {
      fs.removeSync(dir);
    }
  });
});

describe("snesFixedAssets - emote bubble palette", () => {
  // Regression: palBytes() takes already-5-bit (0..31) components (matching
  // the hand-authored SPR_PALETTE literals it was designed for), but
  // emoteColors comes straight from emotes.png's raw 8-bit pixels - passing
  // those in unconverted masked the LOW 5 bits of an 8-bit value instead of
  // scaling it down (the top 5 bits), turning almost every colour into a
  // different one (e.g. (224,248,208) -> (0,192,128)). User-found: the emote
  // bubbles rendered in visibly wrong colours.
  test("emotes.png's real colours survive 8-bit -> BGR555, not a low-bits slice", async () => {
    const a = await snesFixedAssets();
    const words = [];
    for (let i = 0; i < a.emotePaletteBytes.length; i += 2) {
      words.push(a.emotePaletteBytes[i] | (a.emotePaletteBytes[i + 1] << 8));
    }
    const rgb = words.map(wordToRgb8);
    // index 0 is the transparent marker colour, forced to black regardless
    expect(rgb[0]).toEqual([0, 0, 0]);
    // the emote art's own real colours (5-bit rounded) must appear somewhere
    // in the palette - a scale bug would produce none of these
    expect(rgb).toContainEqual([8, 24, 32]);
    expect(rgb).toContainEqual([224, 248, 208]);
    expect(rgb).toContainEqual([136, 192, 112]);
  });

  // Regression: emotes.png must be a project asset (assets/ui/emotes.png),
  // exactly like ascii/frame/cursor - not the fixed appData/src/snes/tools/
  // emotes.png the engine used to always read regardless of the project.
  // User-found: editing a project's own emotes.png (e.g. the sneshtml
  // template's assets/ui/emotes.png) had no effect on the compiled palette,
  // because that file was never read - only the unrelated tools copy was.
  test("a project's own assets/ui/emotes.png is used, not the fixed tools copy", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-emotes-proj-"));
    try {
      // ascii/frame/cursor still need to exist for buildUiGfx - reuse the
      // stock sample's, only emotes.png is the project-specific fixture.
      fs.copySync(UI_DIR, dir);
      const MARKER = [101, 255, 0]; // "transparent" marker, forced to black
      const CUSTOM = [100, 150, 200]; // not one of tools/emotes.png's colours
      const pixels = [MARKER]; // first-seen colour becomes palette index 0
      for (let i = 1; i < 128 * 16; i++) pixels.push(CUSTOM);
      writePng(Path.join(dir, "emotes.png"), 128, 16, pixels);

      const a = await snesFixedAssets({ uiAssetDir: dir });
      const words = [];
      for (let i = 0; i < a.emotePaletteBytes.length; i += 2) {
        words.push(a.emotePaletteBytes[i] | (a.emotePaletteBytes[i + 1] << 8));
      }
      const rgb = words.map(wordToRgb8);
      expect(rgb).toContainEqual([96, 144, 200]); // CUSTOM, 5-bit rounded
      // none of the fixed tools/emotes.png's real colours should show up
      expect(rgb).not.toContainEqual([8, 24, 32]);
      expect(rgb).not.toContainEqual([136, 192, 112]);
    } finally {
      fs.removeSync(dir);
    }
  });
});
