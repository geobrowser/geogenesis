'use client';

import type { WheelEvent } from 'react';

/**
 * Stops scroll chaining to the page behind a dropdown.
 * When the target can scroll vertically, uses native scrolling in the middle of the range
 * (so trackpads feel smooth) and only prevents default at the edges, where the browser would
 * chain the wheel to the document.
 */
export function trapWheelToElement(scrollEl: HTMLElement | null, e: WheelEvent) {
  if (!scrollEl) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const { scrollTop, scrollHeight, clientHeight } = scrollEl;
  if (scrollHeight <= clientHeight) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const deltaY = e.deltaY;
  const edgeSlop = 2;
  const atTop = scrollTop <= edgeSlop;
  const atBottom = scrollTop + clientHeight >= scrollHeight - edgeSlop;

  if (atTop && deltaY < 0) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  if (atBottom && deltaY > 0) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  e.stopPropagation();
}
