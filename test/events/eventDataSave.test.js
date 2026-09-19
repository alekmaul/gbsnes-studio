import { compile } from "../../src/lib/events/eventDataSave";

test("Should be able to save data", () => {
  const mockDataSave = jest.fn();
  compile(
    { saveSlot: 1 },
    {
      dataSave: mockDataSave
    }
  );
  expect(mockDataSave).toBeCalledWith(1, undefined);
});

test("Should be able to save data and run On Save children", () => {
  const mockDataSave = jest.fn();
  const onSavePath = [{ command: "EVENT_END", id: "abc" }];
  compile(
    { saveSlot: 2, true: onSavePath },
    {
      dataSave: mockDataSave
    }
  );
  expect(mockDataSave).toBeCalledWith(2, onSavePath);
});
