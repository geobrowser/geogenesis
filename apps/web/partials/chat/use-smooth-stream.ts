'use client';

import * as React from 'react';

// Paces Anthropic's bursty SSE deltas into a steady reveal via rAF so the
// text flows in instead of popping in chunks.
export function useSmoothStream(target: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = React.useState(target);
  const targetRef = React.useRef(target);
  targetRef.current = target;

  React.useEffect(() => {
    if (!isStreaming) {
      setDisplayed(target);
    }
  }, [isStreaming, target]);

  React.useEffect(() => {
    if (!isStreaming) return;

    let raf = 0;
    const tick = () => {
      setDisplayed(prev => {
        const t = targetRef.current;
        const backlog = t.length - prev.length;
        if (backlog <= 0) return prev;
        const chars = Math.max(1, Math.min(12, Math.ceil(backlog * 0.15)));
        return t.slice(0, prev.length + Math.min(chars, backlog));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isStreaming]);

  return displayed;
}
