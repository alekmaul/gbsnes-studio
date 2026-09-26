// M1 of the Map Engine milestone (roadmap artifact) - reshaping an
// imageToBGData() background into PVSnesLib's mapLoad() buffers. There is
// no way to run the real 65816 mapRefreshAll under Jest, so
// decodeMapEngineBackground() (a JS mirror of its exact per-cell decode,
// read straight from pvsneslib/source/maps.asm) is the round-trip check.
import fs from "fs";
import Path from "path";
import os from "os";
import { PNG } from "pngjs";
import { imageToBGData } from "../../../src/lib/compiler/snesgfx";
import {
  MAP_MTSIZE,
  METATILE_DEF_WORDS,
  METATILE_PROP_WORDS,
  METATILE_DEF_INDEX_MASK,
  buildMapEngineBackground,
  decodeMapEngineBackground
} from "../../../src/lib/compiler/snesMapEngine";

const tmpDir = fs.mkdtempSync(Path.join(os.tmpdir(), "snes-mapengine-test-"));

// A small background with several distinct tiles plus a couple of repeats
// (one of them flipped) so dedup + flip both get exercised, same spirit as
// snesFixedAssetsEmotes.test.js's synthetic-PNG fixtures.
const writeTestBg = filePath => {
  const tilesWide = 4;
  const tilesHigh = 2;
  const size = 8;
  const png = new PNG({ width: tilesWide * size, height: tilesHigh * size });
  const paintTile = (tx, ty, [r, g, b], mirrored) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // An asymmetric mark (left half lit) so an H-flip is detectable.
        const lit = mirrored ? x >= size / 2 : x < size / 2;
        const px = tx * size + x;
        const py = ty * size + y;
        const idx = (png.width * py + px) << 2;
        png.data[idx] = lit ? r : 0;
        png.data[idx + 1] = lit ? g : 0;
        png.data[idx + 2] = lit ? b : 0;
        png.data[idx + 3] = 255;
      }
    }
  };
  paintTile(0, 0, [248, 8, 8], false); // tile A
  paintTile(1, 0, [8, 248, 8], false); // tile B
  paintTile(2, 0, [8, 8, 248], false); // tile C
  paintTile(3, 0, [248, 8, 8], true); // tile A, H-flipped -> reuses tile A's def
  paintTile(0, 1, [8, 248, 8], false); // tile B again -> reuses tile B's def
  paintTile(1, 1, [8, 8, 248], false); // tile C again
  paintTile(2, 1, [200, 200, 8], false); // tile D
  paintTile(3, 1, [200, 200, 8], false); // tile D again
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

describe("snesMapEngine - M1 metatile reshape", () => {
  test("round-trips a real imageToBGData() tilemap through the mapLoad() buffer shapes", async () => {
    const file = Path.join(tmpDir, "bg.png");
    writeTestBg(file);
    const bgData = await imageToBGData(file, { paletteSlot: 2, priority: true });

    expect(bgData.tileCount).toBe(4); // A, B, C, D - the flip/repeats dedup away

    const built = buildMapEngineBackground(bgData, {
      paletteSlot: 2,
      priority: true
    });

    expect(built.mapWidthPx).toBe(4 * MAP_MTSIZE);
    expect(built.mapHeightPx).toBe(2 * MAP_MTSIZE);
    expect(built.metatiles.length).toBe(METATILE_DEF_WORDS * 2);
    expect(built.tilesprop.length).toBe(METATILE_PROP_WORDS * 2);
    // header (6 bytes) + one word per map cell
    expect(built.layer1map.length).toBe(6 + bgData.tilemap.length * 2);

    const decoded = decodeMapEngineBackground(built);
    expect(decoded.tileW).toBe(4);
    expect(decoded.tileH).toBe(2);
    expect(decoded.tilemap).toEqual(bgData.tilemap);
  });

  test("unused definition-table and property-table entries stay zero", async () => {
    const file = Path.join(tmpDir, "bg-small.png");
    writeTestBg(file);
    const bgData = await imageToBGData(file);
    const built = buildMapEngineBackground(bgData);

    // Only bgData.tileCount (4) of the 2048 def-table words should be non-zero
    // (entry 0 is a real, non-zero word too since paletteSlot/priority default
    // to 0 here - index 0 itself is a valid "populated" value - so check by
    // position instead of by value).
    const defWordAt = i => built.metatiles[i * 2] | (built.metatiles[i * 2 + 1] << 8);
    for (let i = bgData.tileCount; i < 8; i++) {
      expect(defWordAt(i)).toBe(0);
    }
    expect(built.tilesprop.every(b => b === 0)).toBe(true);
  });

  test("rejects a background needing more unique tiles than the 10-bit index field can address", () => {
    const bgData = {
      tiles: new Array(METATILE_DEF_INDEX_MASK + 2).fill([]),
      tilemap: [],
      tileW: 1,
      tileH: 1
    };
    expect(() => buildMapEngineBackground(bgData)).toThrow(/1024/);
  });
});
