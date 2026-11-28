import { compile } from "../../src/lib/events/eventIfVariableFlagsCompare";

const temporaryEntityVariable = (num) => `tmp${num + 1}`;

test("Should be able to conditionally execute if variable contains a flag", () => {
  const mockIfVariableValue = jest.fn();
  const mockVariableCopy = jest.fn();
  const mockVariableClearFlags = jest.fn();
  const truePath = [{ command: "EVENT_END", id: "abc" }];
  const falsePath = [{ command: "EVENT_END", id: "def" }];

  compile(
    {
      variable: "2",
      flag: 5,
      true: truePath,
      false: falsePath
    },
    {
      ifVariableValue: mockIfVariableValue, 
      variableCopy: mockVariableCopy,
      variableClearFlags: mockVariableClearFlags,
      temporaryEntityVariable
    }
  );

  expect(mockVariableCopy).toBeCalledWith("tmp1", "2");
  // every bit but flag 6's is cleared
  expect(mockVariableClearFlags).toBeCalledWith("tmp1", 0xffff - 32);

  expect(mockIfVariableValue).toBeCalledWith("tmp1", "!=", 0, truePath, falsePath);
});
