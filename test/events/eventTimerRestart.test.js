import { compile } from "../../src/lib/events/eventTimerRestart";

test("Should be able to disable timer", () => {
  const mockTimerRestart = jest.fn();

  compile(
    {},
    {
      timerRestart: mockTimerRestart
    }
  );
  expect(mockTimerRestart).toBeCalledWith(0);
});

test("Should be able to restart a specific timer context", () => {
  const mockTimerRestart = jest.fn();

  compile(
    { timer: 3 },
    {
      timerRestart: mockTimerRestart
    }
  );
  expect(mockTimerRestart).toBeCalledWith(3);
});
