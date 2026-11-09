'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';

import { type DebatePageNavigation, createDebatePageOutcome } from './debate-page-outcome';

export type DebatePageOutcome = ReturnType<typeof createDebatePageOutcome>;

/** The debate whose visit was the document's landing page, once one has claimed it. */
let landingDebateId: string | null = null;

/**
 * Whether this visit is the page the document was loaded for (GEO-3604): the navigation entry's URL
 * names it, and only one debate can claim it. A later in-app return to that debate still reads as landing.
 */
export function readDebatePageNavigation(debateId: string): DebatePageNavigation | null {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!entry) return null;
    const landedHere = new URL(entry.name).pathname === window.location.pathname;
    // Keyed on the debate rather than a one-shot flag: Strict Mode builds the memo below twice.
    const landing = landedHere && (landingDebateId === null || landingDebateId === debateId);
    if (landing) landingDebateId = debateId;
    return {
      entry: landing ? 'landing' : 'in_app',
      type: entry.type ?? null,
      activationStart: (entry as PerformanceNavigationTiming & { activationStart?: number }).activationStart ?? 0,
    };
  } catch {
    return null;
  }
}

/** Test seam: forget which debate claimed the landing. */
export function resetDebatePageLandingForTests() {
  landingDebateId = null;
}

/**
 * One `debate_page_outcome` per visit to a debate's page. Null when the feed is not anchored to a
 * debate, which is every surface but the debate's own page.
 */
export function useDebatePageOutcome(debateId: string | undefined): DebatePageOutcome | null {
  // Created during render, not in an effect: the anchor's card can mount in the same commit as the
  // feed when its data is cached, and child effects run before the parent's, so an outcome created
  // in an effect would miss that card's first report.
  const outcome = React.useMemo(
    () =>
      debateId
        ? createDebatePageOutcome({
            debateId,
            emit: properties => capture('debate_page_outcome', properties),
            now: () => performance.now(),
            navigation: readDebatePageNavigation(debateId),
            startedVisible: typeof document === 'undefined' || document.visibilityState !== 'hidden',
            userActivated: () =>
              (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
                ?.hasBeenActive ?? null,
          })
        : null,
    [debateId]
  );

  React.useEffect(() => {
    if (!outcome) return;
    // Capture phase, so this is queued before the analytics runtime's own `pagehide` and
    // `visibilitychange` handlers flush by beacon. After them, the event would wait for a next
    // page load that a visitor who gave up never makes.
    const hidden = () => {
      if (document.visibilityState === 'hidden') outcome.leave('hidden');
      else outcome.visible();
    };
    const touched = () => outcome.touched();
    const pagehide = () => outcome.leave('pagehide');
    window.addEventListener('visibilitychange', hidden, { capture: true });
    window.addEventListener('pagehide', pagehide, { capture: true });
    window.addEventListener('pointerdown', touched, { capture: true, passive: true });
    window.addEventListener('touchstart', touched, { capture: true, passive: true });
    return () => {
      window.removeEventListener('visibilitychange', hidden, { capture: true });
      window.removeEventListener('pagehide', pagehide, { capture: true });
      window.removeEventListener('pointerdown', touched, { capture: true });
      window.removeEventListener('touchstart', touched, { capture: true });
      outcome.leave('unmount');
    };
  }, [outcome]);

  return outcome;
}
