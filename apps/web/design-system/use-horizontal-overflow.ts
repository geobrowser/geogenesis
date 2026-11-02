'use client';

import * as React from 'react';

export type HorizontalOverflow = {
  /** Wider than its box at all. */
  scrollable: boolean;
  /** There is content scrolled out of view before the start. */
  start: boolean;
  /** There is content still out of view past the end. */
  end: boolean;
};

const NO_OVERFLOW: HorizontalOverflow = { scrollable: false, start: false, end: false };

/**
 * Which sides of a horizontal scroller have content out of view, kept current as it scrolls and as
 * it or its content changes size — a count landing in a badge, or a tab that appears.
 *
 * `slackPx` absorbs sub-pixel widths, which leave `scrollLeft` a fraction short of either end.
 *
 * Shared by the tab rows that fade or arrow their overflowing edges (`TabGroup`, and the debates'
 * `ScrollableTabRow`), which each measured this for themselves.
 */
export function useHorizontalOverflow(ref: React.RefObject<HTMLElement | null>, slackPx = 1): HorizontalOverflow {
  const [overflow, setOverflow] = React.useState<HorizontalOverflow>(NO_OVERFLOW);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      const next: HorizontalOverflow = {
        scrollable: maxScrollLeft > 0,
        start: element.scrollLeft > slackPx,
        end: element.scrollLeft < maxScrollLeft - slackPx,
      };
      setOverflow(current =>
        current.scrollable === next.scrollable && current.start === next.start && current.end === next.end
          ? current
          : next
      );
    };

    measure();
    element.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);

    return () => {
      element.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [ref, slackPx]);

  return overflow;
}
