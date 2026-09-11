import Path from "path";
import os from "os";
import fs from "fs-extra";
import getPixelsCb from "get-pixels";
import { PNG } from "pngjs";
import { promisify } from "util";
import {
  rgbToBGR555,
  paletteToBGR555,
  paletteBytes,
  tileFromIndices,
  indicesFromTile,
  flipRowsH,
  flipRowsV,
  extractColors,
  imageToBGData,
  imageToSpriteData,
  decodeBGData
} from "../../../src/lib/compiler/snesgfx";

const sprite = name =>
  Path.join(__dirname, "..", "..", "projects", "Test_ActorInvoke", "assets", "sprites", name);

const getPixels = promisify(getPixelsCb);

const bg = name =>
  Path.join(__dirname, "_files", "assets", "backgrounds", name);

// Writes a WxH PNG whose first `numColours` pixels (row-major) are distinct
// greys, and pads the rest with the last of those - so the image has exactly
// `numColours` distinct colours, however big it is. Used to test the
// over-the-colour-limit path without committing a real fixture PNG.
const writeManyColoursPng = (file, width, height, numColours) => {
  const png = new PNG({ width, height });
  const total = width * height;
  for (let i = 0; i < total; i++) {
    const c = Math.min(i, numColours - 1);
    const v = c * 10; // 0,10,20,... - stays under 256 for the sizes used below
    const idx = i << 2;
    png.data[idx] = v;
    png.data[idx + 1] = v;
    png.data[idx + 2] = v;
    png.data[idx + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
};

describe("snesgfx colour", () => {
  test("rgbToBGR555 packs 0bbbbbbgggggrrrrr", () => {
    expect(rgbToBGR555(0, 0, 0)).toBe(0x0000);
    expect(rgbToBGR555(255, 255, 255)).toBe(0x7fff);
    expect(rgbToBGR555(255, 0, 0)).toBe(0x001f);
    expect(rgbToBGR555(0, 255, 0)).toBe(0x03e0);
    expect(rgbToBGR555(0, 0, 255)).toBe(0x7c00);
    // 8->5 bit is a simple >>3 truncation
    expect(rgbToBGR555(8, 16, 24)).toBe((3 << 10) | (2 << 5) | 1);
  });

  test("paletteToBGR555 pads to the requested size", () => {
    expect(paletteToBGR555([[255, 255, 255]], 4)).toEqual([0x7fff, 0, 0, 0]);
  });

  test("paletteBytes emits little-endian words", () => {
    expect(paletteBytes([0x7fff, 0x0001])).toEqual([0xff, 0x7f, 0x01, 0x00]);
  });
});

describe("snesgfx tiles", () => {
  test("tileFromIndices produces 32 bytes of 4bpp planar data", () => {
    const rows = Array.from({ length: 8 }, () => Array(8).fill(0));
    const t = tileFromIndices(rows);
    expect(t).toHaveLength(32);
    expect(t.every(b => b === 0)).toBe(true);
  });

  test("a solid colour-1 tile sets only bitplane 0", () => {
    const rows = Array.from({ length: 8 }, () => Array(8).fill(1));
    const t = tileFromIndices(rows);
    // bytes 0,2,4..14 = bitplane0 rows (0xFF); everything else 0
    for (let i = 0; i < 16; i += 2) expect(t[i]).toBe(0xff);
    for (let i = 1; i < 16; i += 2) expect(t[i]).toBe(0x00);
    for (let i = 16; i < 32; i++) expect(t[i]).toBe(0x00);
  });

  test("a solid colour-15 tile sets all four bitplanes", () => {
    const rows = Array.from({ length: 8 }, () => Array(8).fill(15));
    const t = tileFromIndices(rows);
    expect(t.every(b => b === 0xff)).toBe(true);
  });

  test("leftmost pixel is bit 7 of the row byte", () => {
    const rows = Array.from({ length: 8 }, () => [1, 0, 0, 0, 0, 0, 0, 0]);
    const t = tileFromIndices(rows);
    expect(t[0]).toBe(0x80);
  });

  test("flip helpers", () => {
    const rows = [[1, 2], [3, 4]];
    expect(flipRowsH(rows)).toEqual([[2, 1], [4, 3]]);
    expect(flipRowsV(rows)).toEqual([[3, 4], [1, 2]]);
  });
});

describe("snesgfx imageToSpriteData", () => {
  test("a 3-frame (48x16) actor sheet -> 12 OBJ tiles, one direction each", async () => {
    const s = await imageToSpriteData(sprite("actor.png")); // 48x16, 3 frames
    expect(s.frameCount).toBe(3);
    expect(s.spriteType).toBe(1); // SPRITE_ACTOR
    expect(s.tiles).toHaveLength(12);
    s.tiles.forEach(t => expect(t).toHaveLength(32));
    expect(s.tileBytes).toHaveLength(384);
    // colour 0 (index 0 in the BGR555 palette) forced transparent
    expect(s.paletteBytes[0]).toBe(0);
    expect(s.paletteBytes[1]).toBe(0);
    expect(s.colorCount).toBeGreaterThan(1);
    expect(s.colorCount).toBeLessThanOrEqual(16);
  });

  test("a 6-frame (96x16) actor sheet -> 24 OBJ tiles, 2 walk poses per direction", async () => {
    const s = await imageToSpriteData(sprite("actor_animated.png")); // 96x16, 6 frames
    expect(s.frameCount).toBe(6);
    expect(s.spriteType).toBe(2); // SPRITE_ACTOR_ANIMATED
    expect(s.tiles).toHaveLength(24);
    s.tiles.forEach(t => expect(t).toHaveLength(32));
    expect(s.tileBytes).toHaveLength(768);
  });

  test("a 16x16 sprite converts too, as a single static frame", async () => {
    const s = await imageToSpriteData(sprite("static.png"));
    expect(s.frameCount).toBe(1);
    expect(s.spriteType).toBe(0); // SPRITE_STATIC
    expect(s.tiles).toHaveLength(4);
    expect(s.warnings).toEqual([]);
  });

  test("a 2- or 4-frame 'animated' sheet keeps every frame, SPRITE_STATIC", async () => {
    const ui = Path.join(
      __dirname, "..", "..", "..", "appData", "templates", "sneshtml",
      "assets", "sprites"
    );
    const duck = await imageToSpriteData(Path.join(ui, "duck.png")); // 32x16
    expect(duck.frameCount).toBe(2);
    expect(duck.spriteType).toBe(0); // auto-cycle, not a walk / direction sheet
    expect(duck.tiles).toHaveLength(8);

    const fire = await imageToSpriteData(Path.join(ui, "fire.png")); // 64x16
    expect(fire.frameCount).toBe(4);
    expect(fire.spriteType).toBe(0);
    expect(fire.tiles).toHaveLength(16);
  });

  test("more than 16 colours warns and snaps the overflow to the nearest kept one", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-snesgfx-sprite-"));
    try {
      const file = Path.join(dir, "toomany.png");
      writeManyColoursPng(file, 16, 16, 20); // 20 distinct colours, 16x16 = 1 frame
      const s = await imageToSpriteData(file);
      expect(s.colorCount).toBe(16);
      expect(s.warnings.join(" ")).toMatch(/20 colours, over the 16-colour/);
    } finally {
      fs.removeSync(dir);
    }
  });
});

describe("snesgfx imageToBGData - real GB Studio background", () => {
  let data;
  beforeAll(async () => {
    data = await imageToBGData(bg("mabe_house.png"));
  });

  test("geometry matches a 160x144 image", () => {
    expect(data.tileW).toBe(20);
    expect(data.tileH).toBe(18);
    expect(data.tilemap).toHaveLength(20 * 18);
  });

  test("palette fits a 4bpp layer", () => {
    expect(data.colorCount).toBeLessThanOrEqual(16);
    expect(data.warnings).toEqual([]);
    expect(data.palette.every(w => w >= 0 && w <= 0x7fff)).toBe(true);
  });

  test("tiles are de-duplicated below the raw grid count", () => {
    expect(data.tileCount).toBeLessThan(20 * 18);
    expect(data.tileBytes).toHaveLength(data.tileCount * 32);
  });

  test("maxTiles budget produces a warning", async () => {
    const tight = await imageToBGData(bg("mabe_house.png"), { maxTiles: 10 });
    expect(tight.warnings.join(" ")).toMatch(/tile VRAM budget/);
  });

  test("more than 16 colours warns and snaps the overflow to the nearest kept one", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "gbs-snesgfx-bg-"));
    try {
      const file = Path.join(dir, "toomany.png");
      writeManyColoursPng(file, 8, 8, 20); // 20 distinct colours, one tile
      const tooMany = await imageToBGData(file);
      expect(tooMany.colorCount).toBe(16);
      expect(tooMany.warnings.join(" ")).toMatch(/20 colours, over the 16-colour/);
    } finally {
      fs.removeSync(dir);
    }
  });

  test("every tilemap entry points at a real tile", () => {
    for (const e of data.tilemap) {
      expect(e & 0x3ff).toBeLessThan(data.tileCount);
    }
  });

  test("tile <-> indices round-trips", () => {
    expect(indicesFromTile(data.tiles[0])).toEqual(
      indicesFromTile(tileFromIndices(indicesFromTile(data.tiles[0])))
    );
  });

  test("conversion is lossless: decoded data reproduces the source image", async () => {
    const pixels = await imageToBGData(bg("mabe_house.png")).then(d => d);
    const src = await getPixels(bg("mabe_house.png"));
    const { colors } = extractColors(src);
    const decoded = decodeBGData(pixels);
    let mismatches = 0;
    for (let y = 0; y < 144; y++) {
      for (let x = 0; x < 160; x++) {
        const want = colors.findIndex(
          c =>
            c[0] === src.get(x, y, 0) &&
            c[1] === src.get(x, y, 1) &&
            c[2] === src.get(x, y, 2)
        );
        if (decoded[y][x] !== want) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
  });

  test("byte output is stable", () => {
    expect(data.paletteBytes).toMatchSnapshot("palette");
    expect(data.tiles[0]).toMatchSnapshot("tile0");
    expect(data.tilemap.slice(0, 20)).toMatchSnapshot("tilemap-row0");
    expect(data.tileCount).toMatchSnapshot("tileCount");
  });
});
