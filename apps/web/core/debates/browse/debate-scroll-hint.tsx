'use client';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { useHydrated } from '~/core/hooks/use-hydrated';

import { Text } from '~/design-system/text';

import { ChevronsDown } from './icons';
import { HINT_IDS, dismissedHintsAtom } from '~/atoms/dismissed-hints';

/** Length of one bounce; mirrors `--animate-debate-scroll-hint` in styles/styles.css. */
const BOUNCE_DURATION_MS = 700;
const BOUNCE_COUNT = 6;
const FADE_OUT_MS = 200;

/**
 * Applied to both the hint and the debate media so they bounce as one gesture. Sharing the
 * props is what keeps them in step: same animation, same iteration count, and both classes
 * land in the same commit, so the browser starts them on the same frame.
 */
export const scrollHintBounceProps = {
  className: 'animate-debate-scroll-hint motion-reduce:animate-none',
  style: { animationIterationCount: BOUNCE_COUNT } as React.CSSProperties,
};

type Phase = 'pending' | 'bouncing' | 'leaving' | 'done';

/**
 * Lifecycle for the one-time nudge that the full-screen debates feed scrolls to more
 * debates — the affordance is invisible otherwise, since a single debate fills the
 * viewport with no scrollbar to give it away.
 *
 * Lives in the feed rather than a feed item so the media can bounce along with the hint,
 * and so it can't be torn down by the item churn that happens while the per-debate media
 * lookups land.
 *
 * Shown once per browser, persisted alongside the other product hints. The flag is only
 * written once the bounces have actually played: the feed is `snap-mandatory`, so the
 * browser's own snap adjustment fires `scroll` on the container while the videos load.
 * An earlier version dismissed on that event and spent the hint before it ever painted,
 * which is why there's no "viewer scrolled away" shortcut here — no scroll event can be
 * trusted this early in layout, and the hint is brief enough to just let it finish.
 */
export function useDebateScrollHint(enabled: boolean) {
  const hydrated = useHydrated();
  const [dismissedHints, setDismissedHints] = useAtom(dismissedHintsAtom);
  const [phase, setPhase] = React.useState<Phase>('pending');

  // Decided once, on the first render after hydration where the feed is ready: the
  // persisted flag is written the moment the hint starts leaving, so re-reading it later
  // would yank the fade-out. Waiting for hydration keeps SSR from flashing a hint the
  // viewer already dismissed.
  React.useEffect(() => {
    if (!enabled || !hydrated || phase !== 'pending') return;
    setPhase(dismissedHints.includes(HINT_IDS.debateScroll) ? 'done' : 'bouncing');
  }, [dismissedHints, enabled, hydrated, phase]);

  React.useEffect(() => {
    if (phase !== 'bouncing') return;
    const timer = window.setTimeout(() => setPhase('leaving'), BOUNCE_COUNT * BOUNCE_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  React.useEffect(() => {
    if (phase !== 'leaving') return;
    setDismissedHints(prev => (prev.includes(HINT_IDS.debateScroll) ? prev : [...prev, HINT_IDS.debateScroll]));
    const timer = window.setTimeout(() => setPhase('done'), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [phase, setDismissedHints]);

  return {
    isVisible: phase === 'bouncing' || phase === 'leaving',
    isLeaving: phase === 'leaving',
  };
}

/**
 * The chevrons-and-label nudge itself. Rendered as an overlay pinned to the bottom of the
 * feed, never in the item's flow: the media column is sized to consume the viewport height
 * minus a fixed reserve (`--debate-feed-column-width`), so anything added below it is
 * pushed off the bottom of the screen.
 */
export function DebateScrollHint({ leaving, className }: { leaving: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      data-testid="debate-scroll-hint"
      className={cx(
        scrollHintBounceProps.className,
        'pointer-events-none flex items-center justify-center gap-1.5 text-grey-04 transition-opacity',
        leaving ? 'opacity-0' : 'opacity-100',
        className
      )}
      style={{ ...scrollHintBounceProps.style, transitionDuration: `${FADE_OUT_MS}ms` }}
    >
      <ChevronsDown />
      {/* NB: breakpoints here are desktop-first (md = max-width:767px), so md: targets
          mobile — where the gesture really is a swipe rather than a scroll. */}
      <Text as="span" variant="metadata" color="grey-04" className="!leading-[13px] !tracking-[-0.35px]">
        <span className="md:hidden">Scroll</span>
        <span className="hidden md:inline">Swipe</span>
      </Text>
    </div>
  );
}
