import { compile } from "../../src/lib/events/eventIfExpression";

test("Should be able to conditionally execute based on an expression", () => {
  const mockIfExpression = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  const falsePath = [{ command: "EVENT_END", id: "def" }];
  compile(
    {
      expression: "$health$ >= 0",
      true: truePath,
      false: falsePath,
    },
    {
      ifExpression: mockIfExpression,
    }
  );
  expect(mockIfExpression).toBeCalledWith(
    "$health$ >= 0",
    truePath,
    falsePath
  );
});

test("Should default to falsy expression when none given", () => {
  const mockIfExpression = jest.fn();
  compile(
    {
      true: [],
      false: [],
    },
    {
      ifExpression: mockIfExpression,
    }
  );
  expect(mockIfExpression).toBeCalledWith("0", [], []);
});

test("Should use empty false path when else is disabled", () => {
  const mockIfExpression = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  compile(
    {
      expression: "1",
      true: truePath,
      false: [{ command: "EVENT_END", id: "def" }],
      __disableElse: true,
    },
    {
      ifExpression: mockIfExpression,
    }
  );
  expect(mockIfExpression).toBeCalledWith("1", truePath, []);
});
