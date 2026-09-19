import { compile } from "../../src/lib/events/eventTimerDisable";

test("Should be able to disable timer", () => {
  const mockTimerDisable = jest.fn();

  compile(
    {},
    {
      timerDisable: mockTimerDisable
    }
  );
  expect(mockTimerDisable).toBeCalledWith(0);
});

test("Should be able to disable a specific timer context", () => {
  const mockTimerDisable = jest.fn();

  compile(
    { timer: 1 },
    {
      timerDisable: mockTimerDisable
    }
  );
  expect(mockTimerDisable).toBeCalledWith(1);
});
