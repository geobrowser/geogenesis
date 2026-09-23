'use client';

import * as React from 'react';

export type UseAutofocusOptions = {
  shouldSkipFocus?: () => boolean;
  /**
   * Don't let the focus scroll anything into view.
   *
   * For a field inside a surface that is already positioned — a popover, a docked panel — where the
   * browser's idea of revealing it can only move something the caller had placed deliberately.
   */
  preventScroll?: boolean;
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
  const preventScroll = options?.preventScroll ?? false;

  React.useEffect(() => {
    if (!enabled) return;

    const applyFocus = () => {
      try {
        if (shouldSkipRef.current?.()) return;
        ref.current?.focus({ preventScroll });
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
  }, [enabled, delayMs, preventScroll]);

  return ref;
}
