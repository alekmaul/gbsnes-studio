// Sprite Editor (SPRITE_EDITOR_PROGRESS.md, M2): SpriteSheet.animationType lets a
// project author override imageToSpriteData's own pixel-geometry-only frame-count
// detection, picking which of the 3 real engine interpretations (SPRITE_STATIC /
// SPRITE_ACTOR / SPRITE_ACTOR_ANIMATED) a sheet's frames compile to.
//
// Note: this file was re-created from scratch - no `snesgfx.test.js` exists in
// this repo's history past the v2 M1 wholesale vendor import of GB Studio
// 2.0.0-beta5 sources (confirmed via `git log -- test/data/compiler/snesgfx.test.js`,
// last real commit predates that import), even though CLAUDE.md's own narrative
// cites it repeatedly for post-v2 sprite fixes. Same "fresh vendor import silently
// drops a fork-specific file nothing catches" pattern already documented elsewhere
// in CLAUDE.md (updateChecker.js) - flagged here, not otherwise investigated or
// restored, since it's out of scope for the sprite editor effort this file is
// actually part of.
import fs from "fs";
import Path from "path";
import os from "os";
import { PNG } from "pngjs";
import {
  imageToSpriteData,
  imageToMetaspriteData,
  imageToActorMetaspriteData,
  imageToFreeformMetaspriteData
} from "../../../src/lib/compiler/snesgfx";

const tmpDir = fs.mkdtempSync(Path.join(os.tmpdir(), "snesgfx-test-"));

const OBJ_FLIPX = 0x40;
const OBJ_FLIPY = 0x80;

// Solid-colour rectangles painted onto a (0,0,0) background (always becomes
// palette index 0 / transparent, matching every other fixture in this file).
const writeRectsPng = (filePath, width, height, rects) => {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 255;
  }
  rects.forEach(({ x, y, w, h, color: [r, g, b] }) => {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const idx = (width * (y + yy) + (x + xx)) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = g;
        png.data[idx + 2] = b;
        png.data[idx + 3] = 255;
      }
    }
  });
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

// frameCount distinct solid-colour 16x16 frames side by side, each frame's own
// colour distinct so palette extraction doesn't matter for these assertions.
const writeFramesPng = (filePath, frameCount) => {
  const size = 16;
  const png = new PNG({ width: size * frameCount, height: size });
  for (let f = 0; f < frameCount; f++) {
    const r = (f + 1) * 30;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (png.width * y + (f * size + x)) << 2;
        png.data[idx] = r;
        png.data[idx + 1] = 80;
        png.data[idx + 2] = 160;
        png.data[idx + 3] = 255;
      }
    }
  }
  fs.writeFileSync(filePath, PNG.sync.write(png));
};

describe("imageToSpriteData - animationType override (Sprite Editor M2)", () => {
  test("no override: pure auto-detect from frame count, unchanged behaviour", async () => {
    const file = Path.join(tmpDir, "actor6.png");
    writeFramesPng(file, 6);
    const conv = await imageToSpriteData(file);
    expect(conv.frameCount).toBe(6);
    expect(conv.spriteType).toBe(2); // SPRITE_ACTOR_ANIMATED
    expect(conv.warnings).toEqual([]);
  });

  test('"fixed" override re-labels a 6-frame directional sheet as a static auto-cycle', async () => {
    const file = Path.join(tmpDir, "actor6-fixed.png");
    writeFramesPng(file, 6);
    const conv = await imageToSpriteData(file, { animationTypeOverride: "fixed" });
    expect(conv.frameCount).toBe(6);
    expect(conv.spriteType).toBe(0); // SPRITE_STATIC, not SPRITE_ACTOR_ANIMATED
    expect(conv.warnings).toEqual([]);
  });

  test('"multi" override selects the 3-frame directional interpretation', async () => {
    const file = Path.join(tmpDir, "actor6-multi.png");
    writeFramesPng(file, 6);
    const conv = await imageToSpriteData(file, { animationTypeOverride: "multi" });
    expect(conv.frameCount).toBe(3);
    expect(conv.spriteType).toBe(1); // SPRITE_ACTOR
    expect(conv.warnings).toEqual([]);
  });

  test('"multi_movement" override requires 6 real frames and warns-and-falls-back otherwise', async () => {
    const file = Path.join(tmpDir, "actor3.png");
    writeFramesPng(file, 3);
    const conv = await imageToSpriteData(file, {
      animationTypeOverride: "multi_movement",
    });
    // falls back to the plain auto-detected 3-frame result
    expect(conv.frameCount).toBe(3);
    expect(conv.spriteType).toBe(1);
    expect(conv.warnings.length).toBe(1);
    expect(conv.warnings[0]).toMatch(/Four Directions \+ Movement/);
  });
});

describe("imageToMetaspriteData (SPRITE_EDITOR_PROGRESS.md M5 - real metasprite support)", () => {
  test("one sub-sprite per metasprite (blockSize === metaWidth === metaHeight), 3 metasprites side by side", async () => {
    const file = Path.join(tmpDir, "meta_basic.png");
    // Pixel (0,0) must stay background (the "colour 0 = index 0" convention
    // every sprite/background converter in this file relies on) - a leading
    // fully-blank metasprite guarantees that, rather than a coloured rect
    // accidentally covering the image's own first-scanned pixel.
    writeRectsPng(file, 48, 16, [
      { x: 16, y: 0, w: 16, h: 16, color: [200, 50, 50] },
      { x: 32, y: 0, w: 16, h: 16, color: [50, 200, 50] }
    ]);
    const conv = await imageToMetaspriteData(file, {
      blockSize: 16,
      metaWidth: 16,
      metaHeight: 16
    });
    expect(conv.metaCols).toBe(3);
    expect(conv.metaRows).toBe(1);
    expect(conv.metasprites.length).toBe(3);
    expect(conv.metasprites[0].base).toEqual([]); // fully blank
    expect(conv.metasprites[1].base).toEqual([
      { dx: 0, dy: 0, tile: conv.metasprites[1].base[0]?.tile, props: 0 }
    ]);
    expect(conv.metasprites[2].base).toEqual([
      { dx: 0, dy: 0, tile: conv.metasprites[2].base[0]?.tile, props: 0 }
    ]);
    // each solid 16x16 block is 4 identical 8x8 tiles, so red and green each
    // dedupe to 1 unique tile - and they must be different tiles from each
    // other (and from the blank metasprite's own background tile).
    const redTile = conv.metasprites[1].base[0].tile;
    const greenTile = conv.metasprites[2].base[0].tile;
    expect(redTile).not.toBe(greenTile);
    expect(conv.tiles.length).toBe(3);
    expect(conv.metasprites[0].flipX).toBeUndefined();
  });

  test("blank sub-sprites are skipped, non-blank duplicate sub-sprites dedupe to the same tile", async () => {
    const file = Path.join(tmpDir, "meta_blank.png");
    // 16x16 metasprite, blockSize 8 -> a 2x2 grid of sub-sprites; top-left and
    // bottom-right left as background (blank), top-right and bottom-left both
    // painted the same colour.
    writeRectsPng(file, 16, 16, [
      { x: 8, y: 0, w: 8, h: 8, color: [100, 150, 200] },
      { x: 0, y: 8, w: 8, h: 8, color: [100, 150, 200] }
    ]);
    const conv = await imageToMetaspriteData(file, {
      blockSize: 8,
      metaWidth: 16,
      metaHeight: 16
    });
    expect(conv.metasprites.length).toBe(1);
    const { base } = conv.metasprites[0];
    expect(base.length).toBe(2);
    expect(base[0]).toEqual({ dx: 8, dy: 0, tile: base[0].tile, props: 0 });
    expect(base[1]).toEqual({ dx: 0, dy: 8, tile: base[0].tile, props: 0 });
  });

  test("flip variants mirror offsets within the metasprite's own box and set the right OBJ attribute bits", async () => {
    const file = Path.join(tmpDir, "meta_flip.png");
    writeRectsPng(file, 16, 16, [{ x: 8, y: 0, w: 8, h: 8, color: [10, 20, 30] }]);
    const conv = await imageToMetaspriteData(file, {
      blockSize: 8,
      metaWidth: 16,
      metaHeight: 16,
      flip: 7 // flipX + flipY + flipXY
    });
    const [baseItem] = conv.metasprites[0].base;
    expect(baseItem.dx).toBe(8);
    expect(baseItem.dy).toBe(0);

    const [flipXItem] = conv.metasprites[0].flipX;
    expect(flipXItem.dx).toBe(0); // 16 - 8 - 8
    expect(flipXItem.dy).toBe(0);
    expect(flipXItem.tile).toBe(baseItem.tile);
    expect(flipXItem.props & OBJ_FLIPX).toBe(OBJ_FLIPX);

    const [flipYItem] = conv.metasprites[0].flipY;
    expect(flipYItem.dx).toBe(8);
    expect(flipYItem.dy).toBe(8); // 16 - 8 - 0
    expect(flipYItem.props & OBJ_FLIPY).toBe(OBJ_FLIPY);

    const [flipXYItem] = conv.metasprites[0].flipXY;
    expect(flipXYItem.dx).toBe(0);
    expect(flipXYItem.dy).toBe(8);
    expect(flipXYItem.props & (OBJ_FLIPX | OBJ_FLIPY)).toBe(OBJ_FLIPX | OBJ_FLIPY);
  });

  test("a 2x2 metasprite grid keeps each metasprite's own sub-sprite offsets relative to its own origin", async () => {
    const file = Path.join(tmpDir, "meta_grid.png");
    writeRectsPng(file, 32, 32, [
      { x: 0, y: 16, w: 16, h: 16, color: [1, 2, 3] } // bottom-left metasprite only
    ]);
    const conv = await imageToMetaspriteData(file, {
      blockSize: 16,
      metaWidth: 16,
      metaHeight: 16
    });
    expect(conv.metaCols).toBe(2);
    expect(conv.metaRows).toBe(2);
    expect(conv.metasprites.length).toBe(4);
    // row-major order: index 2 is (col 0, row 1) = bottom-left
    expect(conv.metasprites[0].base).toEqual([]); // top-left, fully blank
    expect(conv.metasprites[2].base).toEqual([{ dx: 0, dy: 0, tile: conv.metasprites[2].base[0]?.tile, props: 0 }]);
    expect(conv.metasprites[2].base.length).toBe(1);
  });

  test("rejects a metaWidth/metaHeight that isn't a multiple of blockSize", async () => {
    const file = Path.join(tmpDir, "meta_badsize.png");
    writeRectsPng(file, 16, 16, []);
    await expect(
      imageToMetaspriteData(file, { blockSize: 16, metaWidth: 24, metaHeight: 16 })
    ).rejects.toThrow(/multiple of blockSize/);
  });

  test("rejects an unsupported blockSize", async () => {
    const file = Path.join(tmpDir, "meta_badblock.png");
    writeRectsPng(file, 16, 16, []);
    await expect(
      imageToMetaspriteData(file, { blockSize: 12, metaWidth: 16, metaHeight: 16 })
    ).rejects.toThrow(/blockSize must be 8, 16 or 32/);
  });
});

describe("imageToActorMetaspriteData (SPRITE_EDITOR_PROGRESS.md M8.1)", () => {
  test("6-frame sheet: SPRITE_ACTOR_ANIMATED, only the two side poses (indices 4,5) get a flipX variant", async () => {
    const file = Path.join(tmpDir, "actormeta6.png");
    writeFramesPng(file, 6);
    const conv = await imageToActorMetaspriteData(file);
    expect(conv.frameCount).toBe(6);
    expect(conv.spriteType).toBe(2); // SPRITE_ACTOR_ANIMATED
    expect(conv.metaCols).toBe(6);
    expect(conv.metaRows).toBe(1);
    expect(conv.metasprites.length).toBe(6);
    expect(conv.sideFrameIndices).toEqual([4, 5]);
    [0, 1, 2, 3].forEach(i => {
      expect(conv.metasprites[i].flipX).toBeUndefined();
    });
    [4, 5].forEach(i => {
      expect(conv.metasprites[i].flipX).toBeDefined();
      expect(conv.metasprites[i].flipX[0].tile).toBe(conv.metasprites[i].base[0].tile);
    });
  });

  test("3-frame sheet: SPRITE_ACTOR, only the side pose (index 2) gets a flipX variant", async () => {
    const file = Path.join(tmpDir, "actormeta3.png");
    writeFramesPng(file, 3);
    const conv = await imageToActorMetaspriteData(file);
    expect(conv.frameCount).toBe(3);
    expect(conv.spriteType).toBe(1); // SPRITE_ACTOR
    expect(conv.metasprites.length).toBe(3);
    expect(conv.sideFrameIndices).toEqual([2]);
    expect(conv.metasprites[0].flipX).toBeUndefined();
    expect(conv.metasprites[1].flipX).toBeUndefined();
    expect(conv.metasprites[2].flipX).toBeDefined();
  });

  test('"fixed" override on a 6-frame sheet: SPRITE_STATIC, no flipX variants at all', async () => {
    const file = Path.join(tmpDir, "actormeta6-fixed.png");
    writeFramesPng(file, 6);
    const conv = await imageToActorMetaspriteData(file, { animationTypeOverride: "fixed" });
    expect(conv.frameCount).toBe(6);
    expect(conv.spriteType).toBe(0); // SPRITE_STATIC
    expect(conv.sideFrameIndices).toEqual([]);
    conv.metasprites.forEach(m => expect(m.flipX).toBeUndefined());
  });

  test("a single 16x16 frame: frame 0 only, no flip variant", async () => {
    const file = Path.join(tmpDir, "actormeta1.png");
    writeFramesPng(file, 1);
    const conv = await imageToActorMetaspriteData(file);
    expect(conv.frameCount).toBe(1);
    expect(conv.spriteType).toBe(0);
    expect(conv.metasprites.length).toBe(1);
    expect(conv.sideFrameIndices).toEqual([]);
  });
});

describe("imageToFreeformMetaspriteData (SPRITE_EDITOR_PROGRESS.md M9.3)", () => {
  // 32x32 source: a blank 16x16 region at (0,0) [background/transparent],
  // a solid red 16x16 region at (16,0), a solid blue 16x16 region at (0,16).
  const makeFixture = (file) => {
    writeRectsPng(file, 32, 32, [
      { x: 16, y: 0, w: 16, h: 16, color: [200, 50, 50] },
      { x: 0, y: 16, w: 16, h: 16, color: [50, 50, 200] }
    ]);
  };

  test("resolves one placed tile to a real quad of 4 deduped sub-tiles", async () => {
    const file = Path.join(tmpDir, "freeform_basic.png");
    makeFixture(file);
    const tileId = "t1";
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [{ id: "m0", tiles: [tileId] }],
      tiles: {
        [tileId]: { id: tileId, x: 0, y: 0, sliceX: 16, sliceY: 0, flipX: false, flipY: false, priority: false }
      }
    });
    expect(conv.metaspriteFrames.length).toBe(1);
    expect(conv.metaspriteFrames[0].length).toBe(1);
    const placed = conv.metaspriteFrames[0][0];
    expect(placed.dx).toBe(0);
    expect(placed.dy).toBe(0);
    expect(placed.flipX).toBe(false);
    expect(placed.flipY).toBe(false);
    expect(placed.priority).toBe(false);
    // the solid red 16x16 region is 4 identical 8x8 tiles -> all 4 quad
    // entries resolve to the SAME deduped tile index.
    expect(placed.quad).toEqual([placed.quad[0], placed.quad[0], placed.quad[0], placed.quad[0]]);
    expect(conv.tiles.length).toBe(1); // only 1 unique tile in the whole sheet so far
  });

  test("two tiles referencing the same source region dedupe to the same quad, even across frames", async () => {
    const file = Path.join(tmpDir, "freeform_dedupe.png");
    makeFixture(file);
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [
        { id: "m0", tiles: ["a"] },
        { id: "m1", tiles: ["b"] }
      ],
      tiles: {
        a: { id: "a", x: 0, y: 0, sliceX: 16, sliceY: 0, flipX: false, flipY: false, priority: false },
        b: { id: "b", x: 32, y: 0, sliceX: 16, sliceY: 0, flipX: false, flipY: false, priority: false }
      }
    });
    expect(conv.metaspriteFrames[0][0].quad).toEqual(conv.metaspriteFrames[1][0].quad);
    expect(conv.tiles.length).toBe(1);
  });

  test("two distinct source regions dedupe at the real 8x8 sub-tile level, not just whole-quad", async () => {
    const file = Path.join(tmpDir, "freeform_subtile_dedupe.png");
    // red region at (16,0) and blue at (0,16) share no pixels - this proves
    // each quad gets its own distinct sub-tiles (4 + 4 = 8 total), the
    // negative-control half of the dedupe claim above.
    makeFixture(file);
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [{ id: "m0", tiles: ["red", "blue"] }],
      tiles: {
        red: { id: "red", x: 0, y: 0, sliceX: 16, sliceY: 0, flipX: false, flipY: false, priority: false },
        blue: { id: "blue", x: 16, y: 0, sliceX: 0, sliceY: 16, flipX: false, flipY: false, priority: false }
      }
    });
    const [redTile] = conv.metaspriteFrames[0][0].quad;
    const [blueTile] = conv.metaspriteFrames[0][1].quad;
    expect(redTile).not.toBe(blueTile);
    expect(conv.tiles.length).toBe(2);
  });

  test("carries flipX/flipY/priority through untouched", async () => {
    const file = Path.join(tmpDir, "freeform_flags.png");
    makeFixture(file);
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [{ id: "m0", tiles: ["t1"] }],
      tiles: {
        t1: { id: "t1", x: 8, y: -4, sliceX: 16, sliceY: 0, flipX: true, flipY: true, priority: true }
      }
    });
    const placed = conv.metaspriteFrames[0][0];
    expect(placed.dx).toBe(8);
    expect(placed.dy).toBe(-4);
    expect(placed.flipX).toBe(true);
    expect(placed.flipY).toBe(true);
    expect(placed.priority).toBe(true);
  });

  test("a tile sliced partly off the source image edge doesn't throw - out-of-bounds reads as transparent", async () => {
    const file = Path.join(tmpDir, "freeform_oob.png");
    makeFixture(file);
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [{ id: "m0", tiles: ["t1"] }],
      tiles: {
        // sliceX=24 means this tile's right half (x 32..39) is past the
        // 32px-wide source image entirely.
        t1: { id: "t1", x: 0, y: 0, sliceX: 24, sliceY: 0, flipX: false, flipY: false, priority: false }
      }
    });
    expect(conv.metaspriteFrames[0].length).toBe(1);
    expect(conv.warnings).toEqual([]);
  });

  test("an empty frame (no tiles placed yet) produces an empty placement list, not an error", async () => {
    const file = Path.join(tmpDir, "freeform_empty.png");
    makeFixture(file);
    const conv = await imageToFreeformMetaspriteData(file, {
      frames: [{ id: "m0", tiles: [] }, undefined],
      tiles: {}
    });
    expect(conv.metaspriteFrames).toEqual([[], []]);
  });
});
