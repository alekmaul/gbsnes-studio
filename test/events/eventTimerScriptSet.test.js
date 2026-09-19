import { compile } from "../../src/lib/events/eventTimerScriptSet";

test("Should be able to set a timer script", () => {
  const mockTimerScriptSet = jest.fn();
  const timeoutScript = [{ command: "EVENT_END", id: "abc" }];

  compile(
    {
      duration: 5.0,
      script: timeoutScript
    },
    {
      timerScriptSet: mockTimerScriptSet
    }
  );
  expect(mockTimerScriptSet).toBeCalledWith(5.0, timeoutScript, 0);
});

test("Should be able to set a timer script on a specific timer context", () => {
  const mockTimerScriptSet = jest.fn();
  const timeoutScript = [{ command: "EVENT_END", id: "abc" }];

  compile(
    {
      duration: 5.0,
      script: timeoutScript,
      timer: 2
    },
    {
      timerScriptSet: mockTimerScriptSet
    }
  );
  expect(mockTimerScriptSet).toBeCalledWith(5.0, timeoutScript, 2);
});
