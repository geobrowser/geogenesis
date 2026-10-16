'use client';

import * as React from 'react';

import { useAtom, useSetAtom } from 'jotai';

import { debatesHubFiltersOwnerAtom, resetDebatesHubFiltersAtom } from '~/atoms';

/**
 * Keeps the hub's filter bar attributed to the viewer who set it.
 */
export function useHubFilterOwner(accountKey: string | null, ready: boolean) {
  const [owner, setOwner] = useAtom(debatesHubFiltersOwnerAtom);
  const resetFilters = useSetAtom(resetDebatesHubFiltersAtom);

  // Wait only when switching accounts; signed-out / first sign-in / same account keep the bar.
  const awaitingHandover = ready && accountKey !== null && owner !== null && owner !== accountKey;

  React.useEffect(() => {
    if (!ready || accountKey === null || owner === accountKey) return;
    if (owner !== null) resetFilters();
    setOwner(accountKey);
  }, [accountKey, owner, ready, resetFilters, setOwner]);

  return !awaitingHandover;
}
