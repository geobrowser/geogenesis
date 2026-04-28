'use client';

import type { WheelEvent } from 'react';

/**
 * Prevents the wheel from scrolling the page behind an open dropdown.
 * When `scrollEl` is vertically scrollable, applies the delta to its scrollTop so the menu still scrolls.
 */
export function trapWheelToElement(scrollEl: HTMLElement | null, e: WheelEvent) {
  e.stopPropagation();
  e.preventDefault();

  if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight) {
    scrollEl.scrollTop += e.deltaY;
  }
}
