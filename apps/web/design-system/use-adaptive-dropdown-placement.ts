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

const DEFAULT_DROPDOWN_HEIGHT = 180;
const DEFAULT_GAP = 6;

export function useAdaptiveDropdownPlacement(
  anchorRef: React.RefObject<HTMLElement | null>,
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

    setPlacement({
      align: anchorCenterX < viewportWidth / 2 ? 'start' : 'end',
      side: spaceBelow < preferredHeight + gap ? 'top' : 'bottom',
    });
  }, [anchorRef, gap, preferredHeight]);

  React.useLayoutEffect(() => {
    if (!isOpen) return;

    recomputePlacement();

    const onWindowChange = () => recomputePlacement();
    window.addEventListener('resize', onWindowChange);
    window.addEventListener('scroll', onWindowChange, true);

    return () => {
      window.removeEventListener('resize', onWindowChange);
      window.removeEventListener('scroll', onWindowChange, true);
    };
  }, [isOpen, recomputePlacement]);

  return placement;
}
