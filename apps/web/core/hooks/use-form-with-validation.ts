'use client';

import * as React from 'react';

export function useFormWithValidation<T>(values: T, validate: (values: T) => boolean) {
  const [isValidating, setIsValidating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try {
      setIsValidating(true);
      validate(values);
      setError(null);
      setIsValidating(false);
    } catch (e: unknown) {
      setError((e as Error).message);
      setIsValidating(false);
    }
  }, [values, validate]);

  return [
    {
      isValid: error === null,
      isValidating,
      error,
    },
  ];
}
