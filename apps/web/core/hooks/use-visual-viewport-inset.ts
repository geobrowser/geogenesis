'use client';

import * as React from 'react';

export type VisualViewportInset = {
  /** How far the visible area's bottom edge sits above the layout viewport's (the on-screen keyboard). */
  bottom: number;
  /** The visible area's height. */
  height: number;
};

/**
 * Reads how much of the layout viewport the visual viewport leaves uncovered at the bottom.
 *
 * iOS Safari and Android Chrome shrink only the visual viewport when the keyboard opens, so a
 * `fixed bottom-0` surface stays behind the keyboard. Positioning it by `bottom` and capping it by
 * `height` keeps it above. Null while disabled or where `visualViewport` is missing.
 */
export function readVisualViewportInset(): VisualViewportInset | null {
  if (typeof window === 'undefined' || !window.visualViewport) return null;
  const vv = window.visualViewport;
  // The layout viewport: what `fixed` positions against. innerHeight follows pinch zoom on some engines.
  const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
  return {
    bottom: Math.max(0, Math.round(layoutHeight - (vv.offsetTop + vv.height))),
    height: Math.round(vv.height),
  };
}

export function useVisualViewportInset(enabled: boolean): VisualViewportInset | null {
  const [inset, setInset] = React.useState<VisualViewportInset | null>(null);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setInset(null);
      return;
    }
    const vv = window.visualViewport;
    const update = () => {
      const next = readVisualViewportInset();
      setInset(prev => (prev && next && prev.bottom === next.bottom && prev.height === next.height ? prev : next));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
