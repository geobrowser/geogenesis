'use client';

import * as React from 'react';

/**
 * Autofocuses an element when `enabled` becomes true.
 *
 * @param enabled  - Whether the element should receive focus.
 * @param delayMs  - Optional delay in ms before focusing (e.g. to wait for an animation).
 * @returns A ref to attach to the focusable element.
 */
export function useAutofocus<T extends HTMLElement = HTMLElement>(enabled: boolean, delayMs = 0): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);

  React.useEffect(() => {
    if (!enabled) return;

    if (delayMs <= 0) {
      ref.current?.focus();
      return;
    }

    const timer = setTimeout(() => {
      ref.current?.focus();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [enabled, delayMs]);

  return ref;
}
