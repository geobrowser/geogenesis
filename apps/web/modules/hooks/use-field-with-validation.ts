'use client';

import * as React from 'react';

export function useFieldWithValidation(
  initialValue: string,
  { validate, transform }: { validate: (value: string) => boolean; transform?: (value: string) => string }
) {
  const [value, setValue] = React.useState(initialValue);
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const memoizedValidate = React.useCallback(validate, [validate]);
  const memoizedTransformedValue = React.useMemo(() => {
    if (transform) {
      return transform(value);
    }

    return value;
  }, [transform, value]);

  React.useEffect(() => {
    try {
      setIsValidating(true);
      memoizedValidate(memoizedTransformedValue);
      setError(null);
      setIsValidating(false);
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsValidating(false);
    }
  }, [memoizedTransformedValue, memoizedValidate]);

  return [
    {
      value: memoizedTransformedValue,
      error,
      isValidating,
      isValid: error === null,
    },
    (v: string) => setValue(v),
  ] as const;
}
