'use client';

import * as React from 'react';

// Paces Anthropic's bursty SSE deltas into a steady reveal via rAF so the
// text flows in instead of popping in chunks.
export function useSmoothStream(target: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = React.useState(target);
  const displayedRef = React.useRef(target);
  const targetRef = React.useRef(target);
  targetRef.current = target;

  React.useEffect(() => {
    if (!isStreaming) {
      displayedRef.current = target;
      setDisplayed(target);
    }
  }, [isStreaming, target]);

  React.useEffect(() => {
    if (!isStreaming) return;

    let raf = 0;
    const tick = () => {
      const t = targetRef.current;
      const prev = displayedRef.current;
      const backlog = t.length - prev.length;
      if (backlog < 0) {
        displayedRef.current = t;
        setDisplayed(t);
        return;
      }
      if (backlog === 0) return;
      const chars = Math.max(1, Math.min(12, Math.ceil(backlog * 0.15)));
      const next = t.slice(0, prev.length + Math.min(chars, backlog));
      displayedRef.current = next;
      setDisplayed(next);
      if (next.length < t.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming]);

  return displayed;
}
