import { createScenePacker, TILES_PER_PAIR, SLOTS_PER_PAIR } from "../../../src/lib/compiler/packSceneSprites";

const tile = (fillByte) => new Array(32).fill(fillByte);
const quad = (a, b, c, d) => [tile(a), tile(b), tile(c), tile(d)];

describe("createScenePacker (SPRITE_EDITOR_PROGRESS.md M8.2)", () => {
  test("allocates the first quad right after the reserved prefix, at a valid hardware-aligned base", () => {
    const packer = createScenePacker({ totalTiles: 512, reservedTiles: 64 });
    const base = packer.alloc(quad(1, 2, 3, 4));
    expect(base).toBe(64); // first free row pair starts right after the 2 reserved ones
    expect(base % 16).toBeLessThanOrEqual(14);
    expect(base % 2).toBe(0);
  });

  test(`fills exactly ${SLOTS_PER_PAIR} slots per row pair before moving to the next`, () => {
    const packer = createScenePacker({ totalTiles: 512, reservedTiles: 0 });
    const bases = [];
    for (let i = 0; i < SLOTS_PER_PAIR + 1; i++) {
      bases.push(packer.alloc(quad(i, i, i, i))); // distinct content each time, no dedup
    }
    // first 8 slots stay within row pair 0 (tiles 0-31)
    for (let i = 0; i < SLOTS_PER_PAIR; i++) {
      expect(bases[i]).toBeLessThan(TILES_PER_PAIR);
    }
    // the 9th must jump to the next row pair, not reuse a tile from pair 0
    expect(bases[SLOTS_PER_PAIR]).toBeGreaterThanOrEqual(TILES_PER_PAIR);
  });

  test("writes each of the 4 tiles to the correct N, N+1, N+16, N+17 VRAM offsets", () => {
    const packer = createScenePacker({ totalTiles: 512, reservedTiles: 0 });
    const base = packer.alloc(quad(10, 20, 30, 40));
    const readTile = (tileIndex) => packer.sheet.slice(tileIndex * 32, tileIndex * 32 + 32);
    expect(readTile(base)).toEqual(tile(10));
    expect(readTile(base + 1)).toEqual(tile(20));
    expect(readTile(base + 16)).toEqual(tile(30));
    expect(readTile(base + 17)).toEqual(tile(40));
  });

  test("identical quads (byte-for-byte) dedupe to the same VRAM placement", () => {
    const packer = createScenePacker({ totalTiles: 512, reservedTiles: 0 });
    const first = packer.alloc(quad(5, 6, 7, 8));
    const second = packer.alloc(quad(5, 6, 7, 8));
    const third = packer.alloc(quad(9, 9, 9, 9)); // distinct - must NOT reuse the dedup slot
    expect(second).toBe(first);
    expect(third).not.toBe(first);
    expect(packer.tileCount).toBe(TILES_PER_PAIR); // only 1 row pair's worth actually used
  });

  test("rejects a reservedTiles not aligned to a full row pair", () => {
    expect(() => createScenePacker({ totalTiles: 512, reservedTiles: 40 })).toThrow(
      /must be a multiple of/
    );
  });

  test("drops poses past the real budget and warns exactly once", () => {
    // small budget: only 1 row pair (32 tiles -> 8 quad slots) available
    const packer = createScenePacker({ totalTiles: 32, reservedTiles: 0 });
    const bases = [];
    for (let i = 0; i < 10; i++) {
      bases.push(packer.alloc(quad(i, i, i, i), `pose${i}`));
    }
    expect(bases.slice(0, 8).every((b) => b !== null)).toBe(true);
    expect(bases[8]).toBeNull();
    expect(bases[9]).toBeNull();
    expect(packer.warnings.length).toBe(1);
    expect(packer.warnings[0]).toMatch(/pose8/);
  });

  test("a scene that exactly fills the budget needs no warning", () => {
    const packer = createScenePacker({ totalTiles: 32, reservedTiles: 0 });
    for (let i = 0; i < SLOTS_PER_PAIR; i++) {
      packer.alloc(quad(i, i, i, i));
    }
    expect(packer.warnings).toEqual([]);
  });
});
