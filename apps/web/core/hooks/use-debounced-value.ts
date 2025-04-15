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

  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    // @ts-expect-error incorrect type
    timer = setTimeout(() => fn(...args), delay);
  };
};

export function useDebouncedValueWithSideEffect<T>({
  callback,
  delay,
  initialValue,
}: {
  callback: (value: T) => void;
  delay: number;
  initialValue: T;
}) {
  const [value, setValue] = React.useState(initialValue);

  const debouncedCallback = debounce((value: T) => {
    callback(value);
  }, delay);

  const onChange = (newValue: T) => {
    setValue(newValue);
    debouncedCallback(newValue);
  };

  React.useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return { value, onChange };
}
