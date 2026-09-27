'use client';

import * as React from 'react';

function getServerSnapshot() {
  return false;
}

/** Subscribe to a CSS media query without duplicating viewport state in React. */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener('change', onStoreChange);
      return () => mediaQuery.removeEventListener('change', onStoreChange);
    },
    [query]
  );

  const getSnapshot = React.useCallback(() => {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  }, [query]);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
