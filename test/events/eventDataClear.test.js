import { compile } from "../../src/lib/events/eventDataClear";

test("Should be able to clear saved data", () => {
  const mockDataClear = jest.fn();
  compile(
    { saveSlot: 0 },
    {
      dataClear: mockDataClear
    }
  );
  expect(mockDataClear).toBeCalledWith(0);
});
