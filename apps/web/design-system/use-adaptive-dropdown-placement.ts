'use client';

import * as React from 'react';

type DropdownAlign = 'start' | 'end';
type DropdownSide = 'top' | 'bottom';

type UseAdaptiveDropdownPlacementOptions = {
  isOpen: boolean;
  /** Height estimate used for fit decisions until `contentElement` can be measured. */
  preferredHeight?: number;
  gap?: number;
  /**
   * The rendered popover content element. When provided, fit decisions use its real
   * measured height instead of `preferredHeight`, and placement recomputes when the
   * content resizes.
   */
  contentElement?: Element | null;
  /** Re-run anchor measurement when these change (e.g. conditional chrome above/below the anchor). */
  recomputeDeps?: ReadonlyArray<unknown>;
};

type AdaptiveDropdownPlacement = {
  align: DropdownAlign;
  side: DropdownSide;
};

/** Default footprint (~4.5 short menu rows + padding) for “open above” decisions. */
const DEFAULT_DROPDOWN_HEIGHT = 220;
const DEFAULT_GAP = 8;

/** When neither side fits, the other side must beat the current one by this much before an open dropdown flips. */
const FLIP_HYSTERESIS = 32;

/**
 * Read `--app-bottom-inset` (set by global floating bars like flow-bar) so
 * dropdowns can subtract it from spaceBelow. Returns 0 when unset/invalid.
 */
function readBottomInset(): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--app-bottom-inset').trim();
  if (!raw) return 0;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function useAdaptiveDropdownPlacement(
  anchorRef: React.RefObject<Element | null>,
  {
    isOpen,
    preferredHeight = DEFAULT_DROPDOWN_HEIGHT,
    gap = DEFAULT_GAP,
    contentElement = null,
    recomputeDeps = [],
  }: UseAdaptiveDropdownPlacementOptions
): AdaptiveDropdownPlacement {
  const [placement, setPlacement] = React.useState<AdaptiveDropdownPlacement>({
    align: 'start',
    side: 'bottom',
  });

  // The side is decided once per open "session" (refreshed once real content can be
  // measured) and then kept until it stops fitting, so scroll-frame recomputes can't
  // flip-flop an open dropdown.
  const sessionSideRef = React.useRef<DropdownSide | null>(null);
  const hasMeasuredRef = React.useRef(false);

  const recomputePlacement = React.useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === 'undefined') return;

    const rect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const anchorCenterX = rect.left + rect.width / 2;
    // Subtract any global bottom inset (e.g. flow-bar's "Review edits" footprint)
    // from the available space below so the dropdown flips up instead of sliding
    // under a floating action bar.
    const bottomInset = readBottomInset();
    const spaceBelow = viewportHeight - rect.bottom - bottomInset;
    const spaceAbove = rect.top;

    const measuredHeight = contentElement?.getBoundingClientRect().height ?? 0;
    const contentHeight = measuredHeight > 0 ? measuredHeight : preferredHeight;
    const needed = contentHeight + gap;

    const previousSide = sessionSideRef.current;
    const isFirstMeasurement = measuredHeight > 0 && !hasMeasuredRef.current;

    let side: DropdownSide;
    if (previousSide === null || isFirstMeasurement) {
      // Fresh decision: prefer below, flip above only when below truly can't fit.
      side = spaceBelow >= needed ? 'bottom' : spaceAbove >= needed || spaceAbove > spaceBelow ? 'top' : 'bottom';
    } else {
      const spaceOnCurrent = previousSide === 'bottom' ? spaceBelow : spaceAbove;
      const spaceOnOther = previousSide === 'bottom' ? spaceAbove : spaceBelow;
      const otherSide: DropdownSide = previousSide === 'bottom' ? 'top' : 'bottom';
      if (spaceOnCurrent >= contentHeight) {
        // The flip threshold (no gap) sits below the open threshold (gap included),
        // so scrolling around the boundary doesn't oscillate.
        side = previousSide;
      } else if (spaceOnOther >= needed || spaceOnOther > spaceOnCurrent + FLIP_HYSTERESIS) {
        side = otherSide;
      } else {
        side = previousSide;
      }
    }

    sessionSideRef.current = side;
    if (measuredHeight > 0) hasMeasuredRef.current = true;

    const align: DropdownAlign = anchorCenterX < viewportWidth / 2 ? 'start' : 'end';
    setPlacement(prev => (prev.align === align && prev.side === side ? prev : { align, side }));
  }, [anchorRef, contentElement, gap, preferredHeight]);

  const rafIdRef = React.useRef<number | null>(null);

  React.useLayoutEffect(() => {
    if (!isOpen) {
      sessionSideRef.current = null;
      hasMeasuredRef.current = false;
      return;
    }

    recomputePlacement();

    const scheduleRecompute = () => {
      if (rafIdRef.current !== null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        recomputePlacement();
      });
    };

    window.addEventListener('resize', scheduleRecompute);
    window.addEventListener('scroll', scheduleRecompute, true);

    let resizeObserver: ResizeObserver | null = null;
    if (contentElement) {
      resizeObserver = new ResizeObserver(scheduleRecompute);
      resizeObserver.observe(contentElement);
    }

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener('resize', scheduleRecompute);
      window.removeEventListener('scroll', scheduleRecompute, true);
      resizeObserver?.disconnect();
    };
  }, [isOpen, contentElement, recomputePlacement, ...recomputeDeps]);

  return placement;
}
