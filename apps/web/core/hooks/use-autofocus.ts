'use client';

import * as React from 'react';

export type UseAutofocusOptions = {
  shouldSkipFocus?: () => boolean;
};

/**
 * Autofocuses when `enabled` becomes true. Optional `shouldSkipFocus` runs immediately before `focus()`.
 */
export function useAutofocus<T extends HTMLElement = HTMLElement>(
  enabled: boolean,
  delayMs = 0,
  options?: UseAutofocusOptions
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  const shouldSkipRef = React.useRef(options?.shouldSkipFocus);
  shouldSkipRef.current = options?.shouldSkipFocus;

  React.useEffect(() => {
    if (!enabled) return;

    const applyFocus = () => {
      try {
        if (shouldSkipRef.current?.()) return;
        ref.current?.focus();
      } catch {
        /* detached */
      }
    };

    if (delayMs <= 0) {
      applyFocus();
      return;
    }

    const timer = setTimeout(() => {
      window.requestAnimationFrame(applyFocus);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [enabled, delayMs]);

  return ref;
}
