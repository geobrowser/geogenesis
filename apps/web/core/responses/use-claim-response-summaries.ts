'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';

import {
  type ClaimResponseTarget,
  claimResponseSummariesQueryKeyPrefix,
  claimResponseSummaryResponderSpaceIds,
  claimResponseTargetKey,
  loadClaimResponderMetadataCaches,
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
  const { personalSpaceId, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();
  const normalizedTargets = normalizeClaimResponseTargets(targets);

  const responseBatch = useQuery({
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
    enabled: enabled && !isPersonalSpaceLoading && normalizedTargets.length > 0,
    staleTime: 30_000,
    retry: 2,
    // GEO-2599: the query key contains the whole target list, so adding a claim —
    // or any local-store update while typing, since the claims page passes
    // `includeUnpublishedLocal` — mints a NEW key. React Query then has no data for
    // it, `isSuccess` drops to false, and `ClaimResponseBatchBoundary` (which gates
    // on exactly that) hides every position until the refetch lands. `staleTime`
    // cannot help: it only applies within one key.
    //
    // That is what "I just lost all of Dovile's positions without doing anything
    // whilst I was typing" was. Invisible on a fast connection, where the gap is
    // milliseconds; most of a minute on a slow one.
    //
    // Serving the previous key's data through the transition keeps known positions
    // on screen while the new set loads. Safe because positions are additive and
    // `spaceId` + `personalSpaceId` are in the key prefix, so it can never show a
    // different space's data.
    placeholderData: keepPreviousData,
  });
  const responderSpaceIds = responseBatch.data ? claimResponseSummaryResponderSpaceIds(responseBatch.data) : [];

  useQuery({
    queryKey: [
      'claim-response-responder-metadata',
      spaceId,
      normalizedTargets.map(claimResponseTargetKey),
      responderSpaceIds,
    ],
    queryFn: ({ signal }) =>
      loadClaimResponderMetadataCaches({
        queryClient,
        spaceId,
        targets: normalizedTargets,
        summaries: responseBatch.data!,
        signal,
      }),
    enabled: responseBatch.isSuccess && responderSpaceIds.length > 0,
    staleTime: 60_000,
    retry: 2,
  });

  return responseBatch;
}

/** A target that carries its own space, for feeds whose rows span more than one. */
export type CrossSpaceClaimResponseTarget = ClaimResponseTarget & { spaceId: string };

/**
 * How many per-space batches are in flight at once.
 *
 * Matches `ENTITY_ID_BATCH_CONCURRENCY` in `core/io/queries.ts` deliberately — a feed can span
 * dozens of spaces, and firing one query per space unbounded trades a queue we control for one we
 * do not.
 */
const SPACE_BATCH_CONCURRENCY = 6;

/**
 * The cross-space counterpart to `useClaimResponseSummaryBatch`.
 *
 * The single-space version is right for a page scoped to one space, and it is what the Claims tab
 * uses. A feed is not: every row carries its own `spaceId`, and the underlying filter pins
 * `spaceId` at the top (`buildClaimResponseSummaryFilter`), so one query cannot cover the list.
 *
 * Rather than widen that filter — which would mean dropping `spaceId` from the summary cache key,
 * and that key is what `use-entity-vote` and `debate-gateway` invalidate against after a vote —
 * this groups the targets by space and reuses the existing single-space loader per group. Each
 * group's results land under the key those consumers already expect, so the vote-write path is
 * untouched.
 *
 * The result is one request per distinct space instead of two per row. A feed of 66 rows across 23
 * spaces goes from 125 requests to 23; a single-space feed goes to one.
 */
export function useClaimResponseSummaryBatchAcrossSpaces({
  targets,
  enabled,
}: {
  targets: CrossSpaceClaimResponseTarget[];
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { personalSpaceId, isLoading: isPersonalSpaceLoading } = usePersonalSpaceId();

  const groups = React.useMemo(() => {
    const bySpace = new Map<string, ClaimResponseTarget[]>();
    for (const target of targets) {
      if (!target.spaceId || !target.entityId) continue;
      const group = bySpace.get(target.spaceId) ?? [];
      group.push({ entityId: target.entityId, responseKind: target.responseKind });
      bySpace.set(target.spaceId, group);
    }
    return [...bySpace.entries()]
      .map(([spaceId, spaceTargets]) => ({ spaceId, targets: normalizeClaimResponseTargets(spaceTargets) }))
      .sort((a, b) => a.spaceId.localeCompare(b.spaceId));
  }, [targets]);

  const groupsKey = React.useMemo(
    () => groups.map(group => `${group.spaceId}|${group.targets.map(claimResponseTargetKey).join(',')}`),
    [groups]
  );

  return useQuery({
    queryKey: ['claim-response-summaries-cross-space', personalSpaceId, groupsKey],
    queryFn: async ({ signal }) => {
      await mapWithConcurrency(groups, SPACE_BATCH_CONCURRENCY, group =>
        loadClaimResponseSummaryCaches({
          queryClient,
          spaceId: group.spaceId,
          targets: group.targets,
          personalSpaceId,
          signal,
        })
      );
      // The loader's value is its cache writes; the components read those per row.
      return groupsKey;
    },
    enabled: enabled && !isPersonalSpaceLoading && groups.length > 0,
    staleTime: 30_000,
    retry: 2,
    /**
     * A feed appends as it pages, so every new page mints a new key. Without this the boundary's
     * `ready` drops to false and every position on screen disappears until the refetch lands — the
     * same failure the single-space hook documents above (GEO-2599).
     */
    placeholderData: keepPreviousData,
  });
}
