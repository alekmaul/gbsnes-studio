import fs from "fs-extra";
import os from "os";
import Path from "path";
import { PNG } from "pngjs";
import {
  compileSpriteSheet,
  getSpriteStateOrder,
  packSceneSprites,
} from "../../../src/lib/compiler/compileSnesSprites";
import { rgbToBGR555 } from "../../../src/lib/compiler/snesgfx";
import loadProjectData from "../../../src/lib/project/loadProjectData";

const getPixels = require("util").promisify(require("get-pixels"));

/* ---- reading the compiled data the way the engine and PPU will --------- */

const s8 = (v) => (v > 127 ? v - 256 : v);
const u16 = (data, at) => data[at] | (data[at + 1] << 8);

const readSlot = (data, slot) => {
  expect(slot).toBeLessThan(data[0]);
  const start = u16(data, 1 + slot * 2);
  const bounds = data.slice(start, start + 4).map(s8);
  const stateCount = data[start + 4];
  const frameTable = start + u16(data, start + 5 + stateCount * 2);
  const animation = (state, index) => {
    const set = start + u16(data, start + 5 + state * 2);
    return { first: data[set + index * 2], last: data[set + index * 2 + 1] };
  };
  const frame = (position) => {
    expect(position).toBeLessThan(data[frameTable]);
    const at = start + u16(data, frameTable + 1 + position * 2);
    return Array.from({ length: data[at] }, (_, i) => {
      const e = at + 1 + i * 5;
      return {
        dx: s8(data[e]),
        dy: s8(data[e + 1]),
        tile: data[e + 2] | ((data[e + 3] & 1) << 8),
        flipY: !!(data[e + 3] & 0x80),
        flipX: !!(data[e + 3] & 0x40),
        priority: (data[e + 3] >> 4) & 3,
        palette: (data[e + 3] >> 1) & 7,
        size: data[e + 4] ? 16 : 8,
      };
    });
  };
  return { bounds, stateCount, animation, frame };
};

const tilePixel = (vram, tile, x, y) => {
  const at = tile * 32;
  const bit = 7 - x;
  return (
    ((vram[at + y * 2] >> bit) & 1) |
    (((vram[at + y * 2 + 1] >> bit) & 1) << 1) |
    (((vram[at + 16 + y * 2] >> bit) & 1) << 2) |
    (((vram[at + 16 + y * 2 + 1] >> bit) & 1) << 3)
  );
};

// "x,y" (from the actor's position) -> BGR555 colour
const drawCompiled = (scene, entries) => {
  const image = {};
  // the first entry is in front
  entries
    .slice()
    .reverse()
    .forEach((e) => {
      for (let y = 0; y < e.size; y++) {
        for (let x = 0; x < e.size; x++) {
          const sx = e.flipX ? e.size - 1 - x : x;
          const sy = e.flipY ? e.size - 1 - y : y;
          const tile = e.tile + (sx >> 3) + (sy >> 3) * 16;
          const index = tilePixel(scene.tiles, tile, sx & 7, sy & 7);
          if (index) {
            const at = (128 + e.palette * 16 + index) * 2 - 256;
            image[`${e.dx + x},${e.dy + y}`] = u16(scene.paletteBytes, at);
          }
        }
      }
    });
  return image;
};

/* ---- drawing the same frame straight from the editor's data ------------- */

const drawSource = (pixels, frame, mirror) => {
  const [width, height] = pixels.shape;
  const key = [0, 1, 2].map((c) => pixels.get(0, 0, c)).join(",");
  const image = {};
  frame.tiles.forEach((tile) => {
    for (let y = 0; y < tile.size; y++) {
      for (let x = 0; x < tile.size; x++) {
        const sx = tile.sliceX + (tile.flipX ? tile.size - 1 - x : x);
        const sy = tile.sliceY + (tile.flipY ? tile.size - 1 - y : y);
        if (sx >= width || sy >= height || pixels.get(sx, sy, 3) < 128) {
          continue;
        }
        const rgb = [0, 1, 2].map((c) => pixels.get(sx, sy, c));
        if (rgb.join(",") !== key) {
          const px = tile.x - 8 + x;
          const py = -(tile.y + tile.size) + y;
          image[`${mirror ? -px - 1 : px},${py}`] = rgbToBGR555(...rgb);
        }
      }
    }
  });
  return image;
};

// The editor animation shown by each engine animation (down, right, up, left,
// then moving), with "m" for a mirrored one
const expectedAnimations = ({ animationType, flipLeft }) => {
  const table = {
    fixed: "0 0 0 0 0 0 0 0",
    fixed_movement: "0 0 0 0 4 4 4 4",
    multi: flipLeft ? "3 0 2 0m 3 0 2 0m" : "3 0 2 1 3 0 2 1",
    multi_movement: flipLeft ? "3 0 2 0m 7 4 6 4m" : "3 0 2 1 7 4 6 5",
    platform_player: flipLeft ? "2m 0 2 0m 7 4 6 4m" : "3 0 2 1 7 4 6 5",
    cursor: "0 1 0 0 0 0 0 0",
  };
  return table[animationType].split(" ").map((entry) => ({
    index: parseInt(entry, 10),
    mirror: entry.endsWith("m"),
  }));
};

// Every state, animation and frame of the compiled slot shows what the editor
// shows
const expectSlotToMatch = async (scene, slot, sheet, filename, stateOrder) => {
  const pixels = await getPixels(filename);
  const compiled = readSlot(scene.data, slot);
  expect(compiled.stateCount).toBe(stateOrder.length);
  let frames = 0;
  stateOrder.forEach((name, stateIndex) => {
    const state =
      sheet.states.find((s) => s.name === name) || sheet.states[0];
    expectedAnimations(state).forEach(({ index, mirror }, engineIndex) => {
      const source = state.animations[index].frames;
      const { first, last } = compiled.animation(stateIndex, engineIndex);
      expect(last - first + 1).toBe(Math.max(1, source.length));
      source.forEach((frame, i) => {
        const entries = compiled.frame(first + i);
        expect(drawCompiled(scene, entries)).toEqual(
          drawSource(pixels, frame, mirror)
        );
        frames++;
      });
    });
  });
  return frames;
};

/* ---- synthetic sheet ---------------------------------------------------- */

const KEY = [0, 255, 0];

// A sheet whose every pixel is different from its mirrored neighbours
const writePng = (path, width, height, color) => {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x, y);
      png.data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  fs.writeFileSync(path, PNG.sync.write(png));
};

// 12 colours in an irregular pattern, key colour on a diagonal
const pattern = (shift = 0) => (x, y) => {
  if ((x + y) % 7 === 0) {
    return KEY;
  }
  const v = (x * 5 + y * 3 + ((x * y) >> 3) + shift) % 12;
  return [v * 20, 255 - v * 16, v * 8 + shift * 8];
};

const tile = (x, y, sliceX, sliceY, size, extra = {}) => ({
  id: `${x}-${y}-${sliceX}-${sliceY}-${size}`,
  x,
  y,
  sliceX,
  sliceY,
  size,
  flipX: false,
  flipY: false,
  priority: false,
  ...extra,
});

const makeSheet = (id, states) => ({
  id,
  name: id,
  boundsX: 0,
  boundsY: 0,
  boundsWidth: 16,
  boundsHeight: 16,
  states: states.map(([name, animationType, flipLeft, animations]) => ({
    id: `${id}-${name}`,
    name,
    animationType,
    flipLeft,
    animations: Array.from({ length: 8 }, (_, i) => ({
      id: `${i}`,
      frames: (animations[i] || [[]]).map((tiles) => ({ id: "f", tiles })),
    })),
  })),
});

// A composed frame: overlapping tiles of both sizes, flips and priority
const composed = [
  tile(-8, 0, 0, 0, 16),
  tile(8, 0, 16, 0, 16, { flipX: true }),
  tile(3, 11, 5, 3, 8, { flipY: true }),
  tile(-5, 19, 32, 8, 8, { flipX: true, flipY: true, priority: true }),
];

let tmp;
beforeAll(async () => {
  tmp = await fs.mkdtemp(Path.join(os.tmpdir(), "gbs-sprites-"));
  writePng(Path.join(tmp, "a.png"), 48, 16, pattern(0));
});
afterAll(async () => {
  await fs.remove(tmp);
});

const compileOne = async (states, filename = "a.png", id = "a") => {
  const sheet = makeSheet(id, states);
  const file = Path.join(tmp, filename);
  return { sheet, file, compiled: await compileSpriteSheet(sheet, file) };
};

describe("compileSpriteSheet", () => {
  test.each([
    ["fixed", false],
    ["fixed_movement", false],
    ["multi", false],
    ["multi", true],
    ["multi_movement", false],
    ["multi_movement", true],
    ["platform_player", false],
    ["platform_player", true],
    ["cursor", false],
  ])("draws a %s state (flip left: %s)", async (type, flipLeft) => {
    // a different frame in every animation
    const animations = Array.from({ length: 8 }, (_, i) => [
      [tile(i - 4, i, i * 3, 0, 8), ...composed],
      [tile(0, 0, i, 0, 16)],
    ]);
    const { sheet, file, compiled } = await compileOne([
      ["", type, flipLeft, animations],
    ]);
    const scene = packSceneSprites([compiled]);
    expect(scene.warnings).toEqual([]);
    expect(
      await expectSlotToMatch(scene, 0, sheet, file, [""])
    ).toBeGreaterThan(8);
  });

  test("keeps one copy of mirrored tiles and identical frames", async () => {
    const frame = [tile(0, 0, 0, 0, 16)];
    const mirrored = [tile(0, 0, 0, 0, 16, { flipX: true })];
    const { compiled } = await compileOne([
      ["", "fixed", false, [[frame, mirrored, frame]]],
    ]);
    expect(compiled.tiles.length).toBe(1);
    expect(compiled.frames.length).toBe(2);
    // all eight animations share one run of the frame table
    expect(compiled.frameOrder).toEqual([0, 1, 0]);
  });

  test("puts the editor's front-most tile first", async () => {
    const { compiled } = await compileOne([
      ["", "fixed", false, [[composed]]],
    ]);
    const scene = packSceneSprites([compiled]);
    const entries = readSlot(scene.data, 0).frame(0);
    expect(entries.map((e) => [e.dx, e.dy, e.size, e.priority])).toEqual([
      [-13, -27, 8, 1],
      [-5, -19, 8, 2],
      [0, -16, 16, 2],
      [-16, -16, 16, 2],
    ]);
  });

  test("leaves out tiles which show nothing", async () => {
    writePng(Path.join(tmp, "blank.png"), 32, 16, (x) =>
      x < 16 ? KEY : [255, 0, 0]
    );
    const { compiled } = await compileOne(
      [["", "fixed", false, [[[tile(0, 0, 0, 0, 16), tile(0, 8, 80, 0, 8)]]]]],
      "blank.png"
    );
    expect(compiled.tiles.length).toBe(0);
    expect(compiled.frames).toEqual([[]]);
  });

  test("reduces a sheet with too many colours to 15", async () => {
    writePng(Path.join(tmp, "many.png"), 16, 16, (x, y) =>
      y === 0 && x === 0 ? KEY : [x * 16, y * 16, 0]
    );
    const { compiled } = await compileOne(
      [["", "fixed", false, [[[tile(0, 0, 0, 0, 16)]]]]],
      "many.png"
    );
    expect(compiled.colors.length).toBe(16);
    expect(compiled.warnings[0]).toMatch(/more than 15 colours/);
  });

  test("measures the collision box from the actor", async () => {
    const sheet = {
      ...makeSheet("a", [["", "fixed", false, []]]),
      boundsX: 2,
      boundsY: 1,
      boundsWidth: 12,
      boundsHeight: 8,
    };
    const compiled = await compileSpriteSheet(sheet, Path.join(tmp, "a.png"));
    expect(readSlot(packSceneSprites([compiled]).data, 0).bounds).toEqual([
      -6,
      5,
      -9,
      -2,
    ]);
  });
});

describe("packSceneSprites", () => {
  test("orders state names and falls back to a sheet's default state", async () => {
    const one = [[[tile(0, 0, 0, 0, 16)]]];
    const two = [[[tile(0, 0, 16, 0, 16)]]];
    const a = await compileOne(
      [
        ["", "fixed", false, one],
        ["Jump", "fixed", false, two],
      ],
      "a.png",
      "a"
    );
    const b = await compileOne(
      [
        ["", "fixed", false, one],
        ["Swim", "fixed", false, two],
        ["Jump", "fixed", false, one],
      ],
      "a.png",
      "b"
    );
    const order = getSpriteStateOrder([a.sheet, b.sheet]);
    expect(order).toEqual(["", "Jump", "Swim"]);
    const scene = packSceneSprites([a.compiled, b.compiled], {
      stateOrder: order,
    });
    await expectSlotToMatch(scene, 0, a.sheet, a.file, order);
    await expectSlotToMatch(scene, 1, b.sheet, b.file, order);
    // sheet "a" has no "Swim" state
    const slot = readSlot(scene.data, 0);
    expect(slot.animation(2, 0)).toEqual(slot.animation(0, 0));
  });

  test("shares tiles and palettes between sheets", async () => {
    const frames = [[[tile(0, 0, 0, 0, 16)]]];
    const a = await compileOne([["", "fixed", false, frames]], "a.png", "a");
    const b = await compileOne([["", "fixed", false, frames]], "a.png", "b");
    const scene = packSceneSprites([a.compiled, b.compiled], {
      palettes: [3],
      reservedTiles: 96,
    });
    expect(scene.warnings).toEqual([]);
    expect(scene.slotPalettes).toEqual([3, 3]);
    // one 16x16 tile on rows 6 and 7
    expect(scene.tileCount).toBe(96 + 18);
    await expectSlotToMatch(scene, 0, a.sheet, a.file, [""]);
    await expectSlotToMatch(scene, 1, b.sheet, b.file, [""]);
  });

  test("warns when sheets sharing a palette have too many colours", async () => {
    writePng(Path.join(tmp, "b.png"), 48, 16, pattern(3));
    const frames = [[[tile(0, 0, 0, 0, 16)]]];
    const a = await compileOne([["", "fixed", false, frames]], "a.png", "a");
    const b = await compileOne([["", "fixed", false, frames]], "b.png", "b");
    const scene = packSceneSprites([a.compiled, b.compiled], {
      palettes: [0],
      sceneName: "Town",
    });
    expect(scene.warnings[0]).toMatch(/'Town': too many sprite colours.*'b'/);
    await expectSlotToMatch(scene, 0, a.sheet, a.file, [""]);
  });

  test("places 8x8 tiles around 16x16 ones and warns when full", async () => {
    const frames = [
      [[tile(0, 0, 0, 0, 16), tile(0, 16, 16, 0, 8), tile(8, 16, 24, 0, 8)]],
    ];
    const a = await compileOne([["", "fixed", false, frames]]);
    const scene = packSceneSprites([a.compiled]);
    expect(
      readSlot(scene.data, 0)
        .frame(0)
        .map((e) => e.tile)
    ).toEqual([3, 2, 0]);

    const full = packSceneSprites([a.compiled], { reservedTiles: 510 });
    expect(full.warnings[0]).toMatch(/more than the 2 sprite tiles/);
    // only the 8x8 tiles fit
    expect(readSlot(full.data, 0).frame(0).length).toBe(2);
  });
});

describe.each(["sneshtml", "snesgbs2"])("template %s", (name) => {
  const root = Path.join(
    __dirname,
    "..",
    "..",
    "..",
    "appData",
    "templates",
    name
  );

  test("compiles every sprite sheet to what the editor shows", async () => {
    const project = await loadProjectData(Path.join(root, "project.gbsproj"));
    const sheets = project.spriteSheets;
    const stateOrder = getSpriteStateOrder(sheets);
    let frames = 0;
    // 8 sheets at a time: one OBJ palette each
    for (let i = 0; i < sheets.length; i += 8) {
      const group = sheets.slice(i, i + 8);
      const files = group.map((sheet) =>
        Path.join(root, "assets", "sprites", sheet.filename)
      );
      const compiled = await Promise.all(
        group.map((sheet, j) => compileSpriteSheet(sheet, files[j]))
      );
      expect([].concat(...compiled.map((c) => c.warnings))).toEqual([]);
      const scene = packSceneSprites(compiled, { stateOrder });
      expect(scene.warnings).toEqual([]);
      for (let j = 0; j < group.length; j++) {
        frames += await expectSlotToMatch(
          scene,
          j,
          group[j],
          files[j],
          stateOrder
        );
      }
    }
    expect(frames).toBeGreaterThan(sheets.length);
  }, 60000);
});
