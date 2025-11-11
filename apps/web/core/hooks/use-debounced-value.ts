'use client';

import * as React from 'react';

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

const debounce = <T extends (...args: any[]) => any>(fn: T, delay: number) => {
  let timer: number | null = null;

  const debouncedFn = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    // @ts-expect-error incorrect type
    timer = setTimeout(() => fn(...args), delay);
  };

  debouncedFn.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debouncedFn;
};

/**
 * Keeps a local version of the initial value. This local version
 * is updated optimistically. Accepts a callback that executes
 * with a debounced delay.
 *
 * One common usecase is to keep local state for an input. After
 * a debounced delay this local state is synced with an external
 * store like the Geo KG.
 */
export function useOptimisticValueWithSideEffect<T>({
  callback,
  delay,
  initialValue,
}: {
  callback: (value: T) => void;
  delay: number;
  initialValue: T;
}) {
  const [value, setValue] = React.useState(initialValue);
  const isTypingRef = React.useRef(false);
  const isInitialMountRef = React.useRef(true);

  const debouncedCallback = React.useMemo(
    () =>
      debounce((value: T) => {
        callback(value);
        isTypingRef.current = false;
      }, delay),
    [callback, delay]
  );

  const onChange = (newValue: T) => {
    isTypingRef.current = true;
    setValue(newValue);
    debouncedCallback(newValue);
  };

  const flush = () => {
    debouncedCallback.cancel();
    callback(value);
    isTypingRef.current = false;
  };

  // Sync external value changes only when not actively typing
  React.useEffect(() => {
    if (!isTypingRef.current && initialValue !== value) {
      setValue(initialValue);
    }
  }, [initialValue, value]);

  // Skip callback on initial mount
  React.useEffect(() => {
    isInitialMountRef.current = false;
  }, []);

  return { value, onChange, flush };
}
