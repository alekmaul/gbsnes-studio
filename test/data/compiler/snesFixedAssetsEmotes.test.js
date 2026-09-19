// M5 (v4): Emote as a real project entity (assets/emotes/*.png, one 16x16
// PNG per emote) instead of a single fixed assets/ui/emotes.png 8-wide grid.
// These tests build tiny synthetic PNGs with pngjs (the same transitive dep
// snesFixedAssets.js already relies on via get-pixels) to check the new
// per-entity path and the legacy grid fallback side by side.
import fs from "fs";
import Path from "path";
import os from "os";
import { PNG } from "pngjs";
import { snesFixedAssets } from "../../../src/lib/compiler/snesFixedAssets";

const tmpDir = fs.mkdtempSync(Path.join(os.tmpdir(), "snes-emote-test-"));

// A single flat colour would land entirely on palette index 0 (the first
// colour seen becomes index 0, and index 0 is always forced transparent/
// black afterwards - see snesFixedAssets.js's `colors[0] = [0, 0, 0]`), so a
// truly solid image would produce an all-zero 4bpp tile indistinguishable
// from an unpopulated one. Paint a black background with a coloured square
// in the middle so a real non-zero palette index is actually used.
const writeSolidPng = (filePath, size, [r, g, b]) => {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const inSquare = x >= 4 && x < size - 4 && y >= 4 && y < size - 4;
      png.data[idx] = inSquare ? r : 0;
      png.data[idx + 1] = inSquare ? g : 0;
      png.data[idx + 2] = inSquare ? b : 0;
      png.data[idx + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

// A 16x16 tile quad packed as 4bpp planar (tile4bpp) is 32 bytes; a solid
// colour produces a non-zero pattern only in the colour-index bitplanes
// (index > 0), so "not all zero" is a reliable "this tile was populated" check.
const isPopulated = (bytes) => bytes.some((b) => b !== 0);

describe("snesFixedAssets - real Emote entities (M5)", () => {
  test("builds one sheet slot per emote file, in order, and reports the real count", async () => {
    const emote0 = Path.join(tmpDir, "red.png");
    const emote1 = Path.join(tmpDir, "green.png");
    writeSolidPng(emote0, 16, [248, 8, 8]);
    writeSolidPng(emote1, 16, [8, 248, 8]);

    const fixed = await snesFixedAssets({
      emoteFilenames: [emote0, emote1],
    });

    expect(fixed.NUM_EMOTES).toBe(2);

    const EMOTE_TILE0 = fixed.EMOTE_TILE0;
    // emote 0 -> tiles EMOTE_TILE0, +1, +16, +17 (see snesFixedAssets.js)
    const tile0 = fixed.spriteTiles.slice(EMOTE_TILE0 * 32, EMOTE_TILE0 * 32 + 32);
    // emote 1 -> tiles EMOTE_TILE0+2, +3, +18, +19
    const tile1 = fixed.spriteTiles.slice(
      (EMOTE_TILE0 + 2) * 32,
      (EMOTE_TILE0 + 2) * 32 + 32
    );
    // emote 2 (never provided) stays zero-filled
    const tile2 = fixed.spriteTiles.slice(
      (EMOTE_TILE0 + 4) * 32,
      (EMOTE_TILE0 + 4) * 32 + 32
    );

    expect(isPopulated(tile0)).toBe(true);
    expect(isPopulated(tile1)).toBe(true);
    expect(isPopulated(tile2)).toBe(false);
  });

  test("caps at 8 emotes even if more files are given", async () => {
    const paths = [];
    for (let i = 0; i < 10; i++) {
      const p = Path.join(tmpDir, `emote${i}.png`);
      writeSolidPng(p, 16, [i * 20, 0, 0]);
      paths.push(p);
    }
    const fixed = await snesFixedAssets({ emoteFilenames: paths });
    expect(fixed.NUM_EMOTES).toBe(8);
  });

  test("falls back to the legacy fixed emotes.png grid when no entities are given", async () => {
    const fixed = await snesFixedAssets();
    expect(fixed.NUM_EMOTES).toBe(8);
    // Every one of the 8 legacy slots should be populated (real art, not blank).
    for (let e = 0; e < 8; e++) {
      const t = fixed.EMOTE_TILE0 + 2 * e;
      const bytes = fixed.spriteTiles.slice(t * 32, t * 32 + 32);
      expect(isPopulated(bytes)).toBe(true);
    }
  });
});
