'use client';

import * as React from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside a container and gives it focus on open, restoring it on close.
 *
 * The mobile hub sheet claims `aria-modal="true"`, which tells assistive tech the rest of the page
 * is unavailable. Without containment that promise is false: the virtual cursor never enters the
 * sheet and Tab walks straight out into a page the same attribute says is hidden.
 */
export function useFocusTrap(active: boolean) {
  const ref = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () =>
      [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null);
    (focusables()[0] ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0]!;
      const last = elements[elements.length - 1]!;
      const activeElement = document.activeElement;
      if (!event.shiftKey && (activeElement === last || !container.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (activeElement === first || !container.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      }
    };

    // On the document, not the container: a click on the backdrop puts focus outside, and Tab has
    // to pull it back rather than continue through the page behind.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused?.focus();
    };
  }, [active]);

  return ref;
}
