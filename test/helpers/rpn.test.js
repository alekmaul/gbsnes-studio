import tokenizer from "../../src/lib/helpers/rpn/tokenizer";
import shuntingYard from "../../src/lib/helpers/rpn/shuntingYard";

const rpn = expression => shuntingYard(tokenizer(expression));

const simplify = tokens =>
  tokens.map(token => {
    if (token.type === "VAL") return token.value;
    if (token.type === "VAR") return token.symbol;
    if (token.type === "OP") return token.operator;
    if (token.type === "FUN") return token.function;
    return token.type;
  });

test("Should order a simple arithmetic expression into postfix", () => {
  expect(simplify(rpn("1 + 2"))).toEqual([1, 2, "+"]);
});

test("Should respect operator precedence", () => {
  expect(simplify(rpn("1 + 2 * 3"))).toEqual([1, 2, 3, "*", "+"]);
});

test("Should respect explicit parentheses", () => {
  expect(simplify(rpn("(1 + 2) * 3"))).toEqual([1, 2, "+", 3, "*"]);
});

test("Should resolve a $variable$ token", () => {
  expect(simplify(rpn("$health$ >= 0"))).toEqual(["$health$", 0, ">="]);
});

// The tokenizer relabels unary minus to a distinct "u" operator symbol (with
// an implicit 0 pushed first) so precedence/associativity can differ from
// binary "-"; rpnOperatorDec (src/lib/compiler/helpers.js) maps "u" to the
// same runtime opcode as "-" only once shuntingYard's output is walked into
// bytecode, not here.
// At position 0 the ported tokenizer keeps the operator symbol "-" itself
// (only a minus following another operator/LBRACE is relabelled to "u") -
// an inconsistency in the upstream source, faithfully preserved since both
// symbols map to the same runtime opcode (RPN_OP_SUB) regardless.
test("Should lower a leading unary minus to an implicit 0 and a binary subtract", () => {
  expect(simplify(rpn("-5"))).toEqual([0, 5, "-"]);
});

test("Should lower unary minus after an operator the same way", () => {
  expect(simplify(rpn("1 * -5"))).toEqual([1, 0, 5, "u", "*"]);
});

test("Should keep bitwise not genuinely unary (no implicit operand)", () => {
  expect(simplify(rpn("~5"))).toEqual([5, "~"]);
});

test("Should order a function call's args before the function", () => {
  expect(simplify(rpn("min(1, 2)"))).toEqual([1, 2, "min"]);
});

test("Should throw on a function call with the wrong number of args", () => {
  expect(() => rpn("min(1, 2, 3)")).toThrow();
});

test("Should throw on mismatched parentheses", () => {
  expect(() => rpn("(1 + 2")).toThrow();
});
