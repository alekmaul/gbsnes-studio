import { compile } from "../../src/lib/events/eventMosaic";

test("Should be able to set the mosaic effect targeting both BG1 and BG3", () => {
  const mockMosaicSet = jest.fn();

  compile(
    {
      size: 8,
      bg1: true,
      bg3: true,
      speed: 2,
      wait: true
    },
    {
      mosaicSet: mockMosaicSet
    }
  );
  expect(mockMosaicSet).toBeCalledWith(8, 5, 2, true);
});

test("Should be able to target BG1 only", () => {
  const mockMosaicSet = jest.fn();

  compile(
    {
      size: 4,
      bg1: true,
      bg3: false,
      speed: 1,
      wait: false
    },
    {
      mosaicSet: mockMosaicSet
    }
  );
  expect(mockMosaicSet).toBeCalledWith(4, 1, 1, false);
});

test("Should be able to target BG3 only", () => {
  const mockMosaicSet = jest.fn();

  compile(
    {
      size: 4,
      bg1: false,
      bg3: true,
      speed: 1,
      wait: false
    },
    {
      mosaicSet: mockMosaicSet
    }
  );
  expect(mockMosaicSet).toBeCalledWith(4, 4, 1, false);
});

test("Should fall back to size 0 and speed 1 when not provided", () => {
  const mockMosaicSet = jest.fn();

  compile(
    {},
    {
      mosaicSet: mockMosaicSet
    }
  );
  expect(mockMosaicSet).toBeCalledWith(0, 0, 1, undefined);
});
