import { compile } from "../../src/lib/events/eventLoopWhile";

test("Should be able to loop while an expression holds", () => {
  const mockWhileExpression = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  compile(
    {
      expression: "$counter$ > 0",
      true: truePath,
    },
    {
      whileExpression: mockWhileExpression,
    }
  );
  expect(mockWhileExpression).toBeCalledWith("$counter$ > 0", truePath);
});

test("Should default to falsy expression when none given", () => {
  const mockWhileExpression = jest.fn();
  compile(
    {
      true: [],
    },
    {
      whileExpression: mockWhileExpression,
    }
  );
  expect(mockWhileExpression).toBeCalledWith("0", []);
});
