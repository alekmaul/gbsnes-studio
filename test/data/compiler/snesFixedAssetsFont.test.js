// M5 (v4): Font is a real project entity (assets/fonts/*.png) - only one
// font is ever compiled in (no in-game switching), resolved by
// compileSnesData.js from the project's first Font entity and passed down
// as `fontFilename`, overriding the default assets/ui/ascii.png.
import fs from "fs";
import Path from "path";
import os from "os";
import { PNG } from "pngjs";
import { snesFixedAssets } from "../../../src/lib/compiler/snesFixedAssets";

const SNESHTML_UI_DIR = Path.join(
  __dirname,
  "..",
  "..",
  "..",
  "appData",
  "templates",
  "sneshtml",
  "assets",
  "ui"
);

const tmpDir = fs.mkdtempSync(Path.join(os.tmpdir(), "snes-font-test-"));

const writeSolidPng = (filePath, size, [r, g, b]) => {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

describe("snesFixedAssets - real Font entity (M5)", () => {
  test("a custom fontFilename changes the compiled font data vs the default ascii.png", async () => {
    const defaultBuild = await snesFixedAssets({ uiAssetDir: SNESHTML_UI_DIR });

    const customFont = Path.join(tmpDir, "custom-font.png");
    writeSolidPng(customFont, 8, [16, 200, 240]); // a colour ascii.png doesn't use
    const customBuild = await snesFixedAssets({
      uiAssetDir: SNESHTML_UI_DIR,
      fontFilename: customFont,
    });

    // A solid tiny swatch produces a uniform tile (all one colour index),
    // unlike ascii.png's real glyph shapes - the palette bytes alone aren't
    // reliable here (the new colour can lose the vote to frame/cursor's own
    // richer colour set and just snap to an existing slot), but the actual
    // glyph tile data will still differ in shape.
    expect(customBuild.uiFont).not.toEqual(defaultBuild.uiFont);
  });

  test("falls back to assets/ui/ascii.png when no fontFilename is given", async () => {
    const fixed = await snesFixedAssets({ uiAssetDir: SNESHTML_UI_DIR });
    expect(fixed.uiFont).toBeDefined();
    expect(fixed.uiFont.length).toBeGreaterThan(0);
  });
});
