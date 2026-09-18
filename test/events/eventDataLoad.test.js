import { compile } from "../../src/lib/events/eventDataLoad";

test("Should be able to load data", () => {
  const mockDataLoad = jest.fn();
  compile(
    { saveSlot: 2 },
    {
      dataLoad: mockDataLoad
    }
  );
  expect(mockDataLoad).toBeCalledWith(2);
});
