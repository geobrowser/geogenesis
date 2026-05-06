'use client';

import * as React from 'react';

// Paces Anthropic's bursty SSE deltas into a steady reveal via rAF so the
// final-text reply flows in instead of popping in chunks. When `animate` is
// true, displayed starts empty and drips up to target — used for the latest
// assistant message which mounts post-cover-lift with target already at full
// text. When false, displayed tracks target without animating (older messages
// render statically in full).
export function useSmoothStream(target: string, animate: boolean): string {
  const [displayed, setDisplayed] = React.useState(() => (animate ? '' : target));
  const displayedRef = React.useRef<string>(animate ? '' : target);
  const targetRef = React.useRef(target);
  targetRef.current = target;

  React.useEffect(() => {
    if (!animate) {
      if (displayedRef.current !== target) {
        displayedRef.current = target;
        setDisplayed(target);
      }
      return;
    }

    if (displayedRef.current === target) return;

    let raf = 0;
    const tick = () => {
      const t = targetRef.current;
      const prev = displayedRef.current;
      // Target shrunk (e.g. visible-text source rolled back when a new tool
      // call landed) — snap to it instead of slicing past the new length.
      if (!t.startsWith(prev) || t.length < prev.length) {
        displayedRef.current = t;
        setDisplayed(t);
        return;
      }
      const backlog = t.length - prev.length;
      if (backlog === 0) return;
      const chars = Math.max(1, Math.min(12, Math.ceil(backlog * 0.15)));
      const next = t.slice(0, prev.length + Math.min(chars, backlog));
      displayedRef.current = next;
      setDisplayed(next);
      if (next.length < t.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, target]);

  return displayed;
}
