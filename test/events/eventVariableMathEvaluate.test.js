import { compile } from "../../src/lib/events/eventVariableMathEvaluate";

test("Should be able to store an evaluated expression in a variable", () => {
  const mockVariableEvaluateExpression = jest.fn();
  compile(
    {
      variable: "0",
      expression: "5 + (6 * $health$)",
    },
    {
      variableEvaluateExpression: mockVariableEvaluateExpression,
    }
  );
  expect(mockVariableEvaluateExpression).toBeCalledWith(
    "0",
    "5 + (6 * $health$)"
  );
});

test("Should default to falsy expression when none given", () => {
  const mockVariableEvaluateExpression = jest.fn();
  compile(
    {
      variable: "0",
    },
    {
      variableEvaluateExpression: mockVariableEvaluateExpression,
    }
  );
  expect(mockVariableEvaluateExpression).toBeCalledWith("0", "0");
});
