'use client';

import * as React from 'react';

import { tagStyles } from '~/design-system/tag';

import { HubPillButton } from './hub-pill-button';

/** How long after the last pointer, key or wheel input in the list the viewer still counts as working it. */
const ACTIVE_FOR_MS = 2_500;

/** How long a "New" tag has to be on screen before it counts as seen. */
const SEEN_AFTER_MS = 3_000;

/**
 * Holds new rows while the viewer used the list in the last few seconds or its top is scrolled out of
 * view. Callback refs, since the list mounts only once loaded.
 */
export function useArrivalHold(enabled: boolean) {
  const [top, topRef] = React.useState<HTMLElement | null>(null);
  const [list, listRef] = React.useState<HTMLElement | null>(null);
  const [active, setActive] = React.useState(false);
  const [topAbove, setTopAbove] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || !list) {
      setActive(false);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const touch = () => {
      setActive(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setActive(false), ACTIVE_FOR_MS);
    };
    const leave = (event: PointerEvent) => {
      // A touch ends with a leave; the timer decides then, not the finger lifting.
      if (event.pointerType !== 'mouse') return;
      if (timer) clearTimeout(timer);
      setActive(false);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;
    for (const type of events) list.addEventListener(type, touch, { passive: true });
    list.addEventListener('pointerleave', leave);
    return () => {
      if (timer) clearTimeout(timer);
      for (const type of events) list.removeEventListener(type, touch);
      list.removeEventListener('pointerleave', leave);
    };
  }, [enabled, list]);

  React.useEffect(() => {
    if (!enabled || !top || typeof IntersectionObserver === 'undefined') {
      setTopAbove(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      // Above the viewport only: a list whose top is below the fold has nothing above it to push.
      setTopAbove(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(top);
    return () => observer.disconnect();
  }, [enabled, top]);

  const scrollToTop = React.useCallback(() => {
    top?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [top]);

  return { topRef, listRef, hold: enabled && (active || topAbove), scrollToTop };
}

/**
 * "1 new match", for arrivals waiting while the list is held; pressing it goes to the top, where they land.
 * Hangs below its positioned parent (the sticky filter block), so it stays on screen at any scroll.
 */
export function NewArrivalsPill({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-full z-10 mt-2 flex justify-center *:pointer-events-auto"
      data-testid="new-matches-pill"
    >
      <HubPillButton variant="primary" analyticsSurface="rematch" analyticsLabel="New matches pill" onClick={onClick}>
        {count === 1 ? '1 new match' : `${count} new matches`}
      </HubPillButton>
    </div>
  );
}

/**
 * The "New" tag on an arrived row. Reports itself seen after it has been on screen for a few seconds
 * of a visible tab.
 */
export function NewArrivalTag({ onSeen }: { onSeen: () => void }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const onSeenRef = React.useRef(onSeen);
  onSeenRef.current = onSeen;

  React.useEffect(() => {
    const tag = ref.current;
    if (!tag || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inView = false;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer =
        inView && document.visibilityState === 'visible' ? setTimeout(() => onSeenRef.current(), SEEN_AFTER_MS) : null;
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      arm();
    });
    observer.observe(tag);
    document.addEventListener('visibilitychange', arm);
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener('visibilitychange', arm);
    };
  }, []);

  return (
    <span
      ref={ref}
      data-testid="new-match-tag"
      className={tagStyles('shrink-0 font-normal whitespace-nowrap text-text')}
    >
      New
    </span>
  );
}
