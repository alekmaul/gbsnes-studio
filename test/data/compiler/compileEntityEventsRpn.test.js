// Exercises the real (non-mocked) event dispatch -> helpers -> ScriptBuilder
// pipeline for the 3 new M3 (v4) events, proving compileEntityEvents finds
// eventIfExpression.js/eventLoopWhile.js/eventVariableMathEvaluate.js by
// their EVENT_* command id and wires the real getVariableIndex-backed
// variable resolution through - scriptBuilderRpn.test.js already covers the
// ScriptBuilder byte-shape in isolation with mocked options.
//
// Byte layout below was captured empirically, not hand-derived: EVENT_END
// emits nothing by itself (compileEntityEvents special-cases it to just stop
// - see the `command !== "EVENT_END"` guard) and only the outermost,
// non-branch compile call appends the real script terminator (0).
import compileEntityEvents from "../../../src/lib/compiler/compileEntityEvents";
import {
  commandIndex as cmd,
  RPN_PUSH_CONST,
  RPN_OPERATOR,
  IF_EXPRESSION,
  RPN_SET_VARIABLE,
  JUMP,
  END,
} from "../../../src/lib/events/scriptCommands";

const compile = (input, variables = []) => {
  const output = [];
  compileEntityEvents(input, {
    output,
    variables,
    scene: { actors: [], triggers: [] },
    warnings: () => {},
  });
  return output;
};

test("EVENT_VARIABLE_MATH_EVALUATE resolves a real variable index", () => {
  const variables = ["0"];
  const output = compile(
    [
      {
        command: "EVENT_VARIABLE_MATH_EVALUATE",
        args: { variable: "1", expression: "1 + 2" },
      },
    ],
    variables
  );
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    0,
    1,
    cmd(RPN_PUSH_CONST),
    0,
    2,
    cmd(RPN_OPERATOR),
    2, // rpnOperatorDec("+")
    cmd(RPN_SET_VARIABLE),
    0,
    1,
    cmd(END), // top-level script terminator
  ]);
  expect(variables).toEqual(["0", "1"]);
});

test("EVENT_IF_EXPRESSION compiles a real branch around real child events", () => {
  const output = compile([
    {
      command: "EVENT_IF_EXPRESSION",
      args: { expression: "1" },
      children: {
        true: [{ command: "EVENT_END" }],
        false: [{ command: "EVENT_END" }],
      },
    },
  ]);
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    0,
    1,
    cmd(IF_EXPRESSION),
    0,
    9,
    cmd(JUMP),
    0,
    9,
    cmd(END),
  ]);
});

test("EVENT_LOOP_WHILE compiles a self-looping real branch", () => {
  const output = compile([
    {
      command: "EVENT_LOOP_WHILE",
      args: { expression: "1" },
      children: {
        true: [{ command: "EVENT_END" }],
      },
    },
  ]);
  expect(output).toEqual([
    cmd(RPN_PUSH_CONST),
    0,
    1,
    cmd(IF_EXPRESSION),
    0,
    9,
    cmd(JUMP),
    0,
    12,
    cmd(JUMP),
    0,
    0, // back to loopStart (0)
    cmd(END),
  ]);
});
