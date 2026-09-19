import { compile } from "../../src/lib/events/eventLoopFor";

const makeHelpers = () => {
  const calls = [];
  const labels = {};
  return {
    calls,
    helpers: {
      labelDefine: (id) => calls.push(["labelDefine", id]),
      labelGoto: (id) => calls.push(["labelGoto", id]),
      compileEvents: (path) => calls.push(["compileEvents", path]),
      ifVariableValue: (variable, op, cmp, truePath) => {
        calls.push(["ifVariableValue", variable, op, cmp]);
        if (typeof truePath === "function") {
          truePath();
        }
      },
      ifVariableCompare: (variableA, op, variableB, truePath) => {
        calls.push(["ifVariableCompare", variableA, op, variableB]);
        if (typeof truePath === "function") {
          truePath();
        }
      },
      variableSetToUnionValue: (variable, unionValue) =>
        calls.push(["variableSetToUnionValue", variable, unionValue]),
      variableFromUnion: (unionValue, defaultVariable) => {
        calls.push(["variableFromUnion", unionValue, defaultVariable]);
        return unionValue.type === "variable" ? unionValue.value : defaultVariable;
      },
      variablesAdd: (a, b) => calls.push(["variablesAdd", a, b]),
      variablesSub: (a, b) => calls.push(["variablesSub", a, b]),
      variablesMul: (a, b) => calls.push(["variablesMul", a, b]),
      variablesDiv: (a, b) => calls.push(["variablesDiv", a, b]),
      variablesMod: (a, b) => calls.push(["variablesMod", a, b]),
      temporaryEntityVariable: (i) => `tmp${i}`,
      event: { id: "abc" },
    },
    labels,
  };
};

test("Should initialise the counter and compare against a literal bound", () => {
  const { calls, helpers } = makeHelpers();
  const truePath = [{ command: "EVENT_END", id: "x" }];
  compile(
    {
      variable: "0",
      from: { type: "number", value: 0 },
      comparison: "<=",
      to: { type: "number", value: 10 },
      operation: "add",
      value: { type: "number", value: 1 },
      true: truePath,
    },
    helpers
  );
  expect(calls[0]).toEqual([
    "variableSetToUnionValue",
    "0",
    { type: "number", value: 0 },
  ]);
  expect(calls[1]).toEqual(["labelDefine", "loop_for_abc"]);
  expect(calls[2]).toEqual(["ifVariableValue", "0", "<=", 10]);
  expect(calls[3]).toEqual(["compileEvents", truePath]);
  expect(calls[4]).toEqual([
    "variableFromUnion",
    { type: "number", value: 1 },
    "tmp0",
  ]);
  expect(calls[5]).toEqual(["variablesAdd", "0", "tmp0"]);
  expect(calls[6]).toEqual(["labelGoto", "loop_for_abc"]);
});

test("Should compare against another variable when 'to' is a variable", () => {
  const { calls, helpers } = makeHelpers();
  compile(
    {
      variable: "0",
      from: { type: "number", value: 0 },
      comparison: "<",
      to: { type: "variable", value: "1" },
      operation: "sub",
      value: { type: "variable", value: "2" },
      true: [],
    },
    helpers
  );
  expect(calls[2]).toEqual(["ifVariableCompare", "0", "<", "1"]);
  expect(calls.find((c) => c[0] === "variablesSub")).toEqual([
    "variablesSub",
    "0",
    "2",
  ]);
});

test("Should dispatch each operation to its own builder method", () => {
  ["add", "sub", "mul", "div", "mod"].forEach((operation) => {
    const { calls, helpers } = makeHelpers();
    compile(
      {
        variable: "0",
        from: { type: "number", value: 0 },
        comparison: "<=",
        to: { type: "number", value: 10 },
        operation,
        value: { type: "number", value: 1 },
        true: [],
      },
      helpers
    );
    const expectedMethod = `variables${operation[0].toUpperCase()}${operation.slice(1)}`;
    expect(calls.some((c) => c[0] === expectedMethod)).toBe(true);
  });
});
