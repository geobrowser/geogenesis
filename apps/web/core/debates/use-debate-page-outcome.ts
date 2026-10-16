'use client';

import * as React from 'react';

import { capture } from '~/core/analytics';

import { createDebatePageOutcome } from './debate-page-outcome';

export type DebatePageOutcome = ReturnType<typeof createDebatePageOutcome>;

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
    };
    const pagehide = () => outcome.leave('pagehide');
    window.addEventListener('visibilitychange', hidden, { capture: true });
    window.addEventListener('pagehide', pagehide, { capture: true });
    return () => {
      window.removeEventListener('visibilitychange', hidden, { capture: true });
      window.removeEventListener('pagehide', pagehide, { capture: true });
      outcome.leave('unmount');
    };
  }, [outcome]);

  return outcome;
}
