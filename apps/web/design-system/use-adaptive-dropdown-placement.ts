'use client';

import * as React from 'react';

type DropdownAlign = 'start' | 'end';
type DropdownSide = 'top' | 'bottom';

interface UseAdaptiveDropdownPlacementOptions {
  isOpen: boolean;
  preferredHeight?: number;
  gap?: number;
}

interface AdaptiveDropdownPlacement {
  align: DropdownAlign;
  side: DropdownSide;
}

/** Default footprint (~4.5 short menu rows + padding) for “open above” decisions. */
const DEFAULT_DROPDOWN_HEIGHT = 220;
const DEFAULT_GAP = 8;

export function useAdaptiveDropdownPlacement(
  anchorRef: React.RefObject<Element | null>,
  { isOpen, preferredHeight = DEFAULT_DROPDOWN_HEIGHT, gap = DEFAULT_GAP }: UseAdaptiveDropdownPlacementOptions
): AdaptiveDropdownPlacement {
  const [placement, setPlacement] = React.useState<AdaptiveDropdownPlacement>({
    align: 'start',
    side: 'bottom',
  });

  const recomputePlacement = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === 'undefined') return;

    const rect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const anchorCenterX = rect.left + rect.width / 2;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const wantBelow = spaceBelow >= preferredHeight + gap;
    const canFitAbove = spaceAbove >= preferredHeight + gap;

    let nextSide: DropdownSide = 'bottom';
    if (!wantBelow) {
      nextSide = canFitAbove || spaceAbove > spaceBelow ? 'top' : 'bottom';
    }
    const nextAlign: DropdownAlign = anchorCenterX < viewportWidth / 2 ? 'start' : 'end';

    // Bail out if nothing changed — otherwise every wheel/scroll event
    // creates a fresh state object and re-renders the popover, causing jitter.
    setPlacement(prev => (prev.align === nextAlign && prev.side === nextSide ? prev : { align: nextAlign, side: nextSide }));
  }, [anchorRef, gap, preferredHeight]);

  const rafIdRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (!isOpen) return;

    recomputePlacement();

    const scheduleRecompute = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        recomputePlacement();
      });
    };

    // Only recompute when something that can move the anchor scrolls — the
    // document, or an element that contains the anchor. Scrolls inside the
    // open popover itself don't affect the anchor's position.
    const onScroll = (e: Event) => {
      const anchor = anchorRef.current;
      const target = e.target;
      if (target instanceof Document) {
        scheduleRecompute();
        return;
      }
      if (anchor && target instanceof Node && target.contains(anchor)) {
        scheduleRecompute();
      }
    };

    window.addEventListener('resize', scheduleRecompute);
    window.addEventListener('scroll', onScroll, true);

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener('resize', scheduleRecompute);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [anchorRef, isOpen, recomputePlacement]);

  return placement;
}
