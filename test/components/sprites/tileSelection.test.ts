import { rectangleSelection } from "../../../src/components/sprites/tileSelection";

const select = (
  anchor: [number, number],
  pointer: [number, number],
  size: number,
  image: [number, number] = [48, 32]
) =>
  rectangleSelection(
    { x: anchor[0], y: anchor[1] },
    { x: pointer[0], y: pointer[1] },
    size,
    image[0],
    image[1]
  );

test("selects the pressed tile alone", () => {
  expect(select([16, 0], [20, 5], 16)).toEqual({
    x: 16,
    y: 0,
    width: 1,
    height: 1,
  });
});

test("grows towards the pointer in every direction", () => {
  expect(select([8, 8], [25, 25], 8)).toEqual({
    x: 8,
    y: 8,
    width: 3,
    height: 3,
  });
  expect(select([32, 16], [1, 1], 16)).toEqual({
    x: 0,
    y: 0,
    width: 3,
    height: 2,
  });
});

test("never reaches past the image", () => {
  // 40px wide: only two whole 16px tiles fit from x = 0
  expect(select([0, 0], [39, 1], 16, [40, 16])).toEqual({
    x: 0,
    y: 0,
    width: 2,
    height: 1,
  });
  // no room for another 16px tile left of x = 8
  expect(select([8, 0], [1, 1], 16)).toEqual({
    x: 8,
    y: 0,
    width: 1,
    height: 1,
  });
});

test("ignores a pointer outside the image", () => {
  expect(select([0, 0], [4, -1], 16)).toBeUndefined();
  expect(select([0, 0], [48, 4], 16)).toBeUndefined();
});
