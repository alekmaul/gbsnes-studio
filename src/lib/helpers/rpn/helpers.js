// Ported from GB Studio 3.2.1's src/shared/lib/rpn/{helpers,types}.ts (merged - JS has
// no separate type-only file to port). See src/lib/compiler/scriptBuilder.js `_rpnEmit`
// for how these tokens become bytecode; the runtime side is appData/src/snes/src/rpn.c.

export const ASSOCIATIVITY_LEFT = "left";
export const ASSOCIATIVITY_RIGHT = "right";

export const operatorSymbols = [
  "/",
  "*",
  "+",
  "-",
  "%",
  "&",
  "|",
  "^",
  "~",
  "u",
  "==",
  "!=",
  "<",
  "<=",
  ">",
  ">=",
  "&&",
  "||",
];

export const functionSymbols = ["min", "max", "abs"];

export const functionArgsLen = {
  min: 2,
  max: 2,
  abs: 1,
};

export const isNumeric = str => {
  return (
    str.toLowerCase() === "true" ||
    str.toLowerCase() === "false" ||
    (!isNaN(Number(str)) && isFinite(Number(str)))
  );
};

export const toNumber = str => {
  if (str.toLowerCase() === "true") {
    return 1;
  }
  if (str.toLowerCase() === "false") {
    return 0;
  }
  return Number(str);
};

export const isOperatorSymbol = x => operatorSymbols.indexOf(x) > -1;

export const isFunctionSymbol = x => functionSymbols.indexOf(x) > -1;

export const isVariable = token => {
  return !!/^[$A-Z_][0-9A-Z_$]*$/i.exec(token);
};

export const getPrecedence = token => {
  if (token.type === "FUN") {
    return 4;
  }
  if (token.type === "OP") {
    switch (token.operator) {
      case "u":
      case "~":
        return 14;
      case "*":
      case "/":
      case "%":
        return 12;
      case "+":
      case "-":
        return 11;
      case "<":
      case ">":
      case ">=":
      case "<=":
        return 9;
      case "==":
      case "!=":
        return 8;
      case "&":
        return 7;
      case "^":
        return 6;
      case "|":
        return 5;
      case "&&":
        return 4;
      case "||":
        return 3;
      default:
        throw new Error(`Unexpected operator ${token.operator}`);
    }
  }
  return -1;
};

export const getAssociativity = token => {
  if (token.type === "OP" && token.operator === "u") {
    return ASSOCIATIVITY_RIGHT;
  }
  return ASSOCIATIVITY_LEFT;
};

export const getArgsLen = symbol => functionArgsLen[symbol];
