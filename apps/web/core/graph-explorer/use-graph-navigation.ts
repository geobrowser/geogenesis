'use client';

import * as React from 'react';

import { type GraphHistory, goBack, graphHistoryHref, sameHistory } from './history';

/** Our part of `history.state`: the explorer URL this entry was pushed from. */
type GraphEntryMarker = { graphExplorer?: { from: string } };

function pushedFrom(): string | null {
  const state = window.history.state as GraphEntryMarker | null;
  return state?.graphExplorer?.from ?? null;
}

/**
 * Hops use the history API directly, which Next syncs into usePathname/useSearchParams without a
 * navigation, so the explorer stays mounted. Going back to the centre this entry was pushed from
 * is a browser Back; anything else (a deep link, a bookmark) replaces.
 */
export function useGraphNavigation(history: GraphHistory, params: URLSearchParams) {
  return React.useCallback(
    (next: GraphHistory) => {
      if (sameHistory(next, history)) return;
      const currentHref = graphHistoryHref(history, params);
      const nextHref = graphHistoryHref(next, params);
      if (history.back.length > 0 && sameHistory(next, goBack(history))) {
        if (pushedFrom() === nextHref) window.history.back();
        else window.history.replaceState(null, '', nextHref);
        return;
      }
      window.history.pushState({ graphExplorer: { from: currentHref } } satisfies GraphEntryMarker, '', nextHref);
    },
    [history, params]
  );
}
