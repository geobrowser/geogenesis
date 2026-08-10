'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';

import {
  type ClaimResponseTarget,
  claimResponseSummariesQueryKeyPrefix,
  claimResponseTargetKey,
  loadClaimResponseSummaryCaches,
  normalizeClaimResponseTargets,
} from './claim-response-summaries';

const ClaimResponseBatchContext = React.createContext({ managed: false, ready: true });

export function ClaimResponseBatchBoundary({ ready, children }: { ready: boolean; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ managed: true, ready }), [ready]);
  return React.createElement(ClaimResponseBatchContext.Provider, { value }, children);
}

export function useClaimResponseBatchState() {
  return React.useContext(ClaimResponseBatchContext);
}

export function useClaimResponseSummaryBatch({
  spaceId,
  targets,
  enabled,
}: {
  spaceId: string;
  targets: ClaimResponseTarget[];
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { personalSpaceId } = usePersonalSpaceId();
  const normalizedTargets = normalizeClaimResponseTargets(targets);

  return useQuery({
    queryKey: [
      ...claimResponseSummariesQueryKeyPrefix(personalSpaceId, spaceId),
      normalizedTargets.map(claimResponseTargetKey),
    ],
    queryFn: ({ signal }) =>
      loadClaimResponseSummaryCaches({
        queryClient,
        spaceId,
        targets: normalizedTargets,
        personalSpaceId,
        signal,
      }),
    enabled: enabled && normalizedTargets.length > 0,
    staleTime: 30_000,
    retry: 2,
  });
}
