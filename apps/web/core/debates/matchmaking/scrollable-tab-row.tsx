'use client';

import * as React from 'react';

import cx from 'classnames';

/** Kept clear of the edges when a tab is scrolled into view, so it never lands under a fade. */
const EDGE_CLEARANCE_PX = 40;
/** How far one press of an edge button moves the row: most of a view, so a press is never wasted. */
const SCROLL_STEP_RATIO = 0.7;

type Overflow = { start: boolean; end: boolean };

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
 * The tabs are the caller's, and so is the rule under them, which both rows draw outside the
 * scroller so it spans the visible width.
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
  const [overflow, setOverflow] = React.useState<Overflow>({ start: false, end: false });

  const measure = React.useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    // A pixel of slack either side: sub-pixel widths leave `scrollLeft` a fraction short of the end.
    const start = scroller.scrollLeft > 1;
    const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
    setOverflow(current => (current.start === start && current.end === end ? current : { start, end }));
  }, []);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // The row also changes width without the window doing so: a count lands in a badge, or a tab
    // that was waiting on a lookup appears.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(scroller);
    if (scroller.firstElementChild) observer?.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure]);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!scroller || !active) return;
    // `offsetLeft` against the inner row, which is `relative` and sits at the scroller's origin.
    const left = active.offsetLeft - EDGE_CLEARANCE_PX;
    const right = active.offsetLeft + active.offsetWidth + EDGE_CLEARANCE_PX;
    let target: number | null = null;
    if (left < scroller.scrollLeft) target = Math.max(0, left);
    else if (right > scroller.scrollLeft + scroller.clientWidth) target = right - scroller.clientWidth;
    if (target === null) return;
    scrollTo(scroller, target);
  }, [activeKey]);

  const scrollBy = (direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scrollTo(scroller, scroller.scrollLeft + direction * scroller.clientWidth * SCROLL_STEP_RATIO);
  };

  return (
    <div className="relative">
      {/* `overscroll-x-contain` so a swipe that reaches the end does not chain into the browser's
          back gesture. */}
      <div ref={scrollerRef} className="no-scrollbar overflow-x-auto overscroll-x-contain">
        <div className={cx('relative flex w-max items-center pb-2', className)}>{children}</div>
      </div>
      {overflow.start ? (
        <EdgeButton side="start" label={`${analyticsLabelPrefix} scroll tabs left`} onClick={() => scrollBy(-1)} />
      ) : null}
      {overflow.end ? (
        <EdgeButton side="end" label={`${analyticsLabelPrefix} scroll tabs right`} onClick={() => scrollBy(1)} />
      ) : null}
    </div>
  );
}

function scrollTo(scroller: HTMLElement, left: number) {
  // jsdom has no `scrollTo` on elements, and older engines take no options object.
  if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left, behavior: 'smooth' });
  else scroller.scrollLeft = left;
}

/**
 * The fade and the arrow on one edge. The fade stops a pixel short of the bottom so the row's rule
 * runs unbroken under it, and above the active tab's marker, which is drawn on that rule.
 */
function EdgeButton({ side, label, onClick }: { side: 'start' | 'end'; label: string; onClick: () => void }) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute top-0 bottom-px z-110 flex w-12 items-center',
        side === 'start' ? 'left-0 justify-start bg-linear-to-r' : 'right-0 justify-end bg-linear-to-l',
        'from-white from-40% to-transparent'
      )}
    >
      <button
        type="button"
        aria-label={side === 'start' ? 'Show earlier tabs' : 'Show more tabs'}
        data-geo-analytics-label={label}
        data-geo-analytics-intent="scroll_tabs"
        onClick={onClick}
        className="pointer-events-auto mb-2 grid size-6 place-items-center rounded-full text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className="size-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path
            d={side === 'start' ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
