import { useState } from "react";

const useDelayedState = <T>(initialState: T) => {
  const [value, setValue] = useState(initialState);
  // ReturnType<typeof setTimeout>, not "number": @types/node is in scope
  // (jest/electron), so the global setTimeout resolves to Node's overload
  // (returns NodeJS.Timeout) rather than the DOM one - a version-drift
  // quirk of this fresh install, not a real behavioural difference.
  let timer: ReturnType<typeof setTimeout> | undefined;
  return [
    value,
    (newValue: T, waitTime?: number) => {
      clearTimeout(timer);
      if (waitTime) {
        timer = setTimeout(() => {
          setValue(newValue);
        }, waitTime);
      } else {
        setValue(newValue);
      }
    },
  ] as const;
};

export default useDelayedState;
