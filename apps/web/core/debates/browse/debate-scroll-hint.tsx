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
 * Applied to the debate card, which contains the indicator — so the whole thing travels as
 * one gesture and the two can't drift out of step. Nothing else should apply this: an
 * element inside the card would compound its parent's transform and move twice as far.
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
 * The chevrons-and-label nudge itself. Positioned absolutely just under the debate rather
 * than in flow — the media column is sized to consume the viewport height minus a fixed
 * reserve (`--debate-feed-column-width`), so anything added below it in flow is pushed off
 * the bottom of the screen.
 *
 * Anchored to the debate and not to the feed container: `100dvh` can overshoot the height
 * actually on screen once browser chrome is accounted for, which drops the container's own
 * bottom edge below the fold and takes anything pinned to it along. The debate's bottom is
 * always visible, so measuring from there is the offset that holds.
 *
 * Carries no animation of its own; it sits inside the card, so it inherits the lift.
 */
export function DebateScrollHint({ leaving, className }: { leaving: boolean; className?: string }) {
  return (
    <div
      aria-hidden
      data-testid="debate-scroll-hint"
      className={cx(
        'pointer-events-none flex items-center justify-center gap-1.5 text-grey-04 transition-opacity',
        leaving ? 'opacity-0' : 'opacity-100',
        className
      )}
      style={{ transitionDuration: `${FADE_OUT_MS}ms` }}
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
