'use client';

import { hashKey, useQueryClient } from '@tanstack/react-query';

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { DebateResponseKind } from './api';

type DebateReadinessIntent =
  | {
      desiredReady: true;
      expectedPosition: boolean;
      responseRunId: string | null;
      hasRetried: boolean;
      status: 'waiting' | 'refreshing' | 'submitting' | 'settling';
    }
  | {
      desiredReady: false;
      status: 'submitting' | 'settling';
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
  const setIntent = useCallback(
    (intent: DebateReadinessIntent | null) => queryClient.setQueryData(queryKey, intent),
    [queryClient, queryKey]
  );

  return { intent: useSyncExternalStore(subscribe, getSnapshot, getSnapshot), queryKey, setIntent };
}
