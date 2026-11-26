// Which pixels of a sprite sheet are not drawn. Same rule as the compiler: the
// colour of the top-left pixel of the image (snesgfx.js makes it colour 0),
// plus anything already see-through in the PNG.
export const makeTransparent = (data: Uint8ClampedArray): void => {
  const r = data[0];
  const g = data[1];
  const b = data[2];
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i + 3] < 128 ||
      (data[i] === r && data[i + 1] === g && data[i + 2] === b)
    ) {
      data[i + 3] = 0;
    }
  }
};
