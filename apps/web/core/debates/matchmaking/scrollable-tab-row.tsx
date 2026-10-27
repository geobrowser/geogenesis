'use client';

import * as React from 'react';

import cx from 'classnames';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { useHorizontalOverflow } from '~/design-system/use-horizontal-overflow';

/** Kept clear of the edges when a tab is scrolled into view, so it never lands under a fade. */
const EDGE_CLEARANCE_PX = 40;
/** How far one press of an edge button moves the row: most of a view, so a press is never wasted. */
const SCROLL_STEP_RATIO = 0.7;

/**
 * A tab row that scrolls sideways at every width, and says so (GEO-3148).
 *
 * The debates hub and the debate-again picker both outgrew their rows: the picker's six tabs need
 * roughly 790px against a 680px column, so the last ones sat in an overflow a hidden scrollbar never
 * offered, and on desktop a mouse wheel could not reach them at all. This keeps the scrolling the
 * two rows already had and adds the two things they lacked: a fade and an arrow on whichever side has
 * more tabs, and the selected tab brought fully into view whenever it changes — including the tab a
 * page lands on, which can be one that starts off-screen on a phone.
 *
 * The arrows are drawn at every width rather than only for mice. A phone can swipe, but a fade alone
 * is easy to read as decoration; the arrow says there is more.
 *
 * The tabs are the caller's. The baseline rule is drawn here, outside the scroller, so it spans the
 * visible row rather than the scrolled width; `z-0` so a tab's active marker paints over it.
 */
export function ScrollableTabRow({
  activeKey,
  analyticsLabelPrefix,
  className,
  children,
}: {
  /** Changes when the selected tab does. The tab itself is found by `data-tab-active`. */
  activeKey: string | null;
  /** Names the edge buttons for click analytics, e.g. "Debate rematch". */
  analyticsLabelPrefix: string;
  /** Gap and padding for the inner row. */
  className?: string;
  children: React.ReactNode;
}) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const overflow = useHorizontalOverflow(scrollerRef);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller) scrollActiveTabIntoView(scroller);
  }, [activeKey]);

  // And again when the row itself narrows — a phone turned upright, a window made smaller — which can
  // clip the selected tab without the selection changing. The row's own width only: its content
  // resizes whenever a count lands, and re-aligning on that would pull the row back from under
  // someone scrolling it.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    let width = scroller.clientWidth;
    const observer = new ResizeObserver(() => {
      const narrowed = scroller.clientWidth < width;
      width = scroller.clientWidth;
      // Narrowing is what can clip the selected tab. Widening cannot, and re-aligning on it would
      // move a row the viewer had scrolled away themselves.
      if (narrowed) scrollActiveTabIntoView(scroller);
    });
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const scrollBy = (direction: -1 | 1) => {
    if (scrollerRef.current) scrollRowBy(scrollerRef.current, direction);
  };

  return (
    <div className="relative">
      {/* `overscroll-x-contain` so a swipe that reaches the end does not chain into the browser's
          back gesture. */}
      <div ref={scrollerRef} className="no-scrollbar overflow-x-auto overscroll-x-contain">
        <div className={cx('relative flex w-max items-center pb-2', className)}>{children}</div>
      </div>
      <div aria-hidden className="absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02" />
      {(['start', 'end'] as const).map(side =>
        overflow[side] ? (
          <ScrollEdgeButton
            key={side}
            side={side}
            ariaLabel={side === 'start' ? 'Show earlier tabs' : 'Show more tabs'}
            analyticsLabel={`${analyticsLabelPrefix} scroll tabs ${side === 'start' ? 'left' : 'right'}`}
            analyticsIntent="scroll_tabs"
            onClick={() => scrollBy(side === 'start' ? -1 : 1)}
            // The fade stops a pixel short of the bottom so the row's rule runs unbroken under it,
            // and above the active tab's marker, which is drawn on that rule.
            className="bottom-px z-110 w-12"
            buttonClassName="mb-2 size-6 text-grey-04 hover:bg-grey-01 hover:text-text"
          />
        ) : null
      )}
    </div>
  );
}

/** Scrolls the row just far enough that the selected tab is fully visible, clear of the fades. */
function scrollActiveTabIntoView(scroller: HTMLElement) {
  const active = scroller.querySelector<HTMLElement>('[data-tab-active="true"]');
  if (!active) return;
  // `offsetLeft` against the inner row, which is `relative` and sits at the scroller's origin.
  const left = active.offsetLeft - EDGE_CLEARANCE_PX;
  const right = active.offsetLeft + active.offsetWidth + EDGE_CLEARANCE_PX;
  if (left < scroller.scrollLeft) scrollRowTo(scroller, Math.max(0, left));
  else if (right > scroller.scrollLeft + scroller.clientWidth) scrollRowTo(scroller, right - scroller.clientWidth);
}

/** Moves a sideways row by most of its width, so a press of an edge button is never wasted. */
export function scrollRowBy(scroller: HTMLElement, direction: -1 | 1) {
  scrollRowTo(scroller, scroller.scrollLeft + direction * scroller.clientWidth * SCROLL_STEP_RATIO);
}

function scrollRowTo(scroller: HTMLElement, left: number) {
  // jsdom has no `scrollTo` on elements, and older engines take no options object.
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'smooth' });
  else scroller.scrollLeft = left;
}

/**
 * The fade and the arrow on one edge of a sideways row: this tab row's, and the debates panel's
 * row of upcoming lobbies. `className` places the fade, `buttonClassName` sizes and colours the arrow.
 */
export function ScrollEdgeButton({
  side,
  ariaLabel,
  analyticsLabel,
  analyticsIntent,
  onClick,
  className,
  buttonClassName,
}: {
  side: 'start' | 'end';
  ariaLabel: string;
  analyticsLabel: string;
  analyticsIntent: string;
  onClick: () => void;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute top-0 flex items-center',
        side === 'start' ? 'left-0 justify-start bg-linear-to-r' : 'right-0 justify-end bg-linear-to-l',
        'from-white from-40% to-transparent',
        className
      )}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        data-geo-analytics-label={analyticsLabel}
        data-geo-analytics-intent={analyticsIntent}
        onClick={onClick}
        className={cx('pointer-events-auto grid place-items-center rounded-full transition-colors', buttonClassName)}
      >
        {/* The design system has a right chevron only; the left one is the same glyph turned. */}
        <span className={cx('grid place-items-center', side === 'start' && 'rotate-180')}>
          <ChevronRight />
        </span>
      </button>
    </div>
  );
}
