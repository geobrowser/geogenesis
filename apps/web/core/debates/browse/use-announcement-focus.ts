import * as React from 'react';

/** Keep keyboard focus on an available player control while announcement furniture is hidden. */
export function useAnnouncementFocus(rootRef: React.RefObject<HTMLElement | null>, covered: boolean) {
  const pending = React.useRef<{ original: HTMLElement; fallback: HTMLElement; cancel: () => void } | null>(null);
  const discard = React.useCallback(() => {
    pending.current?.cancel();
    pending.current = null;
  }, []);
  React.useEffect(() => discard, [discard]);
  React.useLayoutEffect(() => {
    if (covered || !pending.current) return;
    const { original, fallback } = pending.current;
    discard();
    // The original can disappear (for example a completed live claim card). Never move focus to
    // a detached or still-inert control, or take it back after the viewer has moved elsewhere.
    if (document.activeElement === fallback && original.isConnected && !original.closest('[inert]')) {
      original.focus({ preventScroll: true });
    }
  }, [covered, discard]);

  return React.useCallback(() => {
    const root = rootRef.current;
    const original = document.activeElement;
    if (!(original instanceof HTMLElement) || !root?.contains(original)) return;
    if (!original.closest('[data-debater-row], [data-claim-corner]')) return;
    const fallback = original.closest('[data-debate-slot]')?.querySelector<HTMLElement>('[aria-label="Pause or play"]');
    if (!fallback) return;
    discard();
    // Called before React commits inert/visibility, so native focus cannot be dropped to body.
    fallback.focus({ preventScroll: true });
    const moved = (event: FocusEvent) => {
      if (event.target !== fallback) discard();
    };
    document.addEventListener('focusin', moved);
    pending.current = { original, fallback, cancel: () => document.removeEventListener('focusin', moved) };
  }, [rootRef, discard]);
}
