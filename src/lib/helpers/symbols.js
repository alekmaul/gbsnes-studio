/*
 * Converts a string into a valid C symbol. Not yet consumed by the SNES
 * compiler (which still derives its own asm labels ad hoc per compile) -
 * this is schema-only groundwork, ported from GB Studio 3.x's own
 * src/lib/helpers/symbols.ts.
 */
export const toValidSymbol = (inputSymbol) => {
  const symbol = String(inputSymbol || "symbol")
    .toLowerCase()
    // Strip anything but alphanumeric
    .replace(/[^a-z0-9_]/g, "_")
    // Squash repeating underscores
    .replace(/[_]+/g, "_")
    // Limit to 27 chars to leave room for _NNN postfix while keeping within C's 31 unique char limit
    .substring(0, 27);
  if (symbol.match(/^\d/)) {
    // Starts with a number
    return `_${symbol}`;
  }
  return symbol;
};

/*
 * Generates the next unique symbol given a preferred name and an array of
 * existing symbols. When symbol already exists will append an incrementing
 * numeric value.
 */
export const genSymbol = (inputSymbol, existingSymbols) => {
  const initialSymbol = toValidSymbol(inputSymbol);
  let symbol = initialSymbol;
  let count = 0;
  while (existingSymbols.includes(symbol)) {
    symbol = `${initialSymbol.replace(/_[0-9]+/, "")}_${count++}`;
  }
  return symbol;
};
