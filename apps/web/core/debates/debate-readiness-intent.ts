'use client';

import { hashKey, useQueryClient } from '@tanstack/react-query';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import type { DebateResponseKind } from './api';

type DebateReadinessIntent = {
  desiredReady: boolean;
  confirmedReady: boolean;
  inFlightReady: boolean | null;
  expectedPosition: boolean | null;
  responseRunId: string | null;
  hasRetried: boolean;
  refreshing: boolean;
  error: string | null;
};

function debateReadinessIntentQueryKey(
  accountKey: string | null,
  spaceId: string,
  claimId: string,
  responseKind: DebateResponseKind
) {
  return ['debates', 'readiness-intent', accountKey, spaceId, claimId, responseKind] as const;
}

export function useDebateReadinessIntent(
  accountKey: string | null,
  spaceId: string,
  claimId: string,
  responseKind: DebateResponseKind
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => debateReadinessIntentQueryKey(accountKey, spaceId, claimId, responseKind),
    [accountKey, claimId, responseKind, spaceId]
  );
  const queryHash = useMemo(() => hashKey(queryKey), [queryKey]);
  const previousQueryKeyRef = useRef(queryKey);
  const getSnapshot = useCallback(
    () => queryClient.getQueryData<DebateReadinessIntent>(queryKey) ?? null,
    [queryClient, queryKey]
  );
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe(event => {
        if (event.query.queryHash === queryHash) onStoreChange();
      }),
    [queryClient, queryHash]
  );

  useEffect(() => {
    const previousQueryKey = previousQueryKeyRef.current;
    if (previousQueryKey !== queryKey) {
      queryClient.setQueryData(previousQueryKey, null);
      previousQueryKeyRef.current = queryKey;
    }
  }, [queryClient, queryKey]);

  const setIntent = useCallback(
    (intent: DebateReadinessIntent | null) => queryClient.setQueryData(queryKey, intent),
    [queryClient, queryKey]
  );
  const updateIntent = useCallback(
    (updater: (current: DebateReadinessIntent | null) => DebateReadinessIntent | null) =>
      queryClient.setQueryData<DebateReadinessIntent | null>(queryKey, current => updater(current ?? null)),
    [queryClient, queryKey]
  );

  return { intent: useSyncExternalStore(subscribe, getSnapshot, getSnapshot), setIntent, updateIntent };
}
