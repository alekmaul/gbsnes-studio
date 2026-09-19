import ScriptBuilder from "../../../src/lib/compiler/scriptBuilder";
import {
  commandIndex as cmd,
  RPN_PUSH_CONST,
  RPN_PUSH_VAR,
  RPN_OPERATOR,
  IF_EXPRESSION,
  RPN_SET_VARIABLE,
  JUMP,
} from "../../../src/lib/events/scriptCommands";
import { rpnOperatorDec, rpnFunctionDec } from "../../../src/lib/compiler/helpers";
import { hi, lo } from "../../../src/lib/helpers/8bit";

test("Should emit a push-const/operator sequence for a simple expression", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
  });
  sb._rpnEmit("1 + 2");
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(1),
    lo(1),
    cmd(RPN_PUSH_CONST),
    hi(2),
    lo(2),
    cmd(RPN_OPERATOR),
    rpnOperatorDec("+"),
  ]);
});

test("Should resolve a $variable$ token through the shared variable index", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: ["0"],
  });
  sb._rpnEmit("$0$ * 2");
  expect(output).toEqual([
    cmd(RPN_PUSH_VAR),
    hi(0),
    lo(0),
    cmd(RPN_PUSH_CONST),
    hi(2),
    lo(2),
    cmd(RPN_OPERATOR),
    rpnOperatorDec("*"),
  ]);
});

test("Should emit an operator for a function call", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
  });
  sb._rpnEmit("min(1, 2)");
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(1),
    lo(1),
    cmd(RPN_PUSH_CONST),
    hi(2),
    lo(2),
    cmd(RPN_OPERATOR),
    rpnFunctionDec("min"),
  ]);
});

test("Should push a zero constant for an empty expression", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
  });
  sb._rpnEmit("");
  expect(output).toEqual([cmd(RPN_PUSH_CONST), hi(0), lo(0)]);
});

test("Should lower unary minus to the same operator as binary subtract", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
  });
  sb._rpnEmit("-5");
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(0),
    lo(0),
    cmd(RPN_PUSH_CONST),
    hi(5),
    lo(5),
    cmd(RPN_OPERATOR),
    rpnOperatorDec("-"),
  ]);
});

test("Should compile ifExpression as an evaluate-then-branch sequence", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
    compileEvents: () => {
      output.push(99);
    },
  });
  sb.ifExpression("1", [], []);
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(1),
    lo(1),
    cmd(IF_EXPRESSION),
    0,
    10,
    99,
    cmd(JUMP),
    0,
    11,
    99,
  ]);
});

test("Should compile whileExpression as a self-looping evaluate-then-branch sequence", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: [],
    compileEvents: () => {
      output.push(99);
    },
  });
  sb.whileExpression("1", []);
  // loopStart @ 0: RPN_PUSH_CONST(3) + IF_EXPRESSION(3) = 6 bytes before the
  // "condition false" JUMP; body starts after that JUMP's own 3 bytes (@9),
  // compiles to a single marker byte (99, @9), then an unconditional JUMP
  // back to loopStart (@10-12).
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(1),
    lo(1),
    cmd(IF_EXPRESSION),
    0,
    9,
    cmd(JUMP),
    0,
    13,
    99,
    cmd(JUMP),
    0,
    0,
  ]);
});

test("Should compile variableEvaluateExpression as an evaluate-then-store sequence", () => {
  const output = [];
  const sb = new ScriptBuilder(output, {
    variables: ["0"],
  });
  sb.variableEvaluateExpression("0", "1 + 2");
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    hi(1),
    lo(1),
    cmd(RPN_PUSH_CONST),
    hi(2),
    lo(2),
    cmd(RPN_OPERATOR),
    rpnOperatorDec("+"),
    cmd(RPN_SET_VARIABLE),
    hi(0),
    lo(0),
  ]);
});
