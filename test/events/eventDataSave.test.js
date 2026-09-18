import { compile } from "../../src/lib/events/eventDataSave";

test("Should be able to save data", () => {
  const mockDataSave = jest.fn();
  compile(
    { saveSlot: 1 },
    {
      dataSave: mockDataSave
    }
  );
  expect(mockDataSave).toBeCalledWith(1);
});
