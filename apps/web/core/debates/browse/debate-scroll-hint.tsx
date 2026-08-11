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
/** Drives both the CSS iteration count and the auto-dismiss, so the hint is on screen
 *  for exactly `BOUNCE_COUNT * BOUNCE_DURATION_MS` before it starts fading. */
const BOUNCE_COUNT = 6;
const FADE_OUT_MS = 200;

type Phase = 'pending' | 'bouncing' | 'leaving' | 'done';

/**
 * One-time nudge that the full-screen debates feed scrolls to more debates. Bounces a few
 * times below the first debate, then fades out for good — the affordance is invisible
 * otherwise, since a single debate fills the viewport with no scrollbar to give it away.
 *
 * Shown once per browser, persisted alongside the other product hints. The flag is only
 * written once the bounces have actually played: the feed is `snap-mandatory`, so the
 * browser's own snap adjustment fires `scroll` on the container while the videos load.
 * An earlier version dismissed on that event and spent the hint before it ever painted,
 * which is why there's no "viewer scrolled away" shortcut here — 2.1s is short enough
 * that letting it finish costs nothing, and no scroll event can be trusted this early.
 */
export function DebateScrollHint({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const [dismissedHints, setDismissedHints] = useAtom(dismissedHintsAtom);
  const [phase, setPhase] = React.useState<Phase>('pending');

  // Decided once, on the first render after hydration: the persisted flag is written the
  // moment the hint starts leaving, so re-reading it later would yank the fade-out.
  // Waiting for hydration keeps SSR from flashing a hint the viewer already dismissed.
  React.useEffect(() => {
    if (!hydrated || phase !== 'pending') return;
    setPhase(dismissedHints.includes(HINT_IDS.debateScroll) ? 'done' : 'bouncing');
  }, [dismissedHints, hydrated, phase]);

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

  if (phase === 'pending' || phase === 'done') return null;

  return (
    <div
      aria-hidden
      data-testid="debate-scroll-hint"
      className={cx(
        'pointer-events-none flex animate-debate-scroll-hint items-center justify-center gap-1.5 text-grey-04 transition-opacity motion-reduce:animate-none',
        phase === 'leaving' ? 'opacity-0' : 'opacity-100',
        className
      )}
      style={{ animationIterationCount: BOUNCE_COUNT, transitionDuration: `${FADE_OUT_MS}ms` }}
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
