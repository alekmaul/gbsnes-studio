import { paintMagic } from "../../src/lib/helpers/paint";

const isInBounds = (width, height) => (x, y) =>
  x >= 0 && x < width && y >= 0 && y < height;

test("Should repaint every position sharing the clicked tile", () => {
  const width = 3;
  // 0 1 0
  // 1 1 1
  // 0 1 0
  const tileLookup = Uint8Array.from([0, 1, 0, 1, 1, 1, 0, 1, 0]);
  const values = new Array(9).fill(0);
  const setValue = (x, y, value) => {
    values[width * y + x] = value;
  };

  paintMagic(width, tileLookup, 1, 0, 9, setValue, isInBounds(width, 3));

  expect(values).toEqual([0, 9, 0, 9, 9, 9, 0, 9, 0]);
});

test("Should only repaint the clicked tile when it's unique", () => {
  const width = 2;
  const tileLookup = Uint8Array.from([0, 1, 2, 3]);
  const values = new Array(4).fill(0);
  const setValue = (x, y, value) => {
    values[width * y + x] = value;
  };

  paintMagic(width, tileLookup, 1, 1, 5, setValue, isInBounds(width, 2));

  expect(values).toEqual([0, 0, 0, 5]);
});
