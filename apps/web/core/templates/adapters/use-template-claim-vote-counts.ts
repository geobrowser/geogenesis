'use client';

import { useQueries } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { CLAIM_RESPONSE_OBJECT_TYPE } from '~/core/claims/browse/claim-response-summary';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { ID } from '~/core/id';
import { getEntityResponseCounts } from '~/core/io/queries';
import { entityResponseCountsQueryKey } from '~/core/responses/entity-response';
import { useClaimResponseSummaryBatch } from '~/core/responses/use-claim-response-summaries';
import type { ResponseCounts } from '~/core/responses/use-entity-response-scores';

/** A claim row and the space it votes in — its `voteTarget.spaceId`. */
export type ClaimVoteCountTarget = { claimId: string; spaceId: string };

export type TemplateClaimVoteCounts = {
  /** The claim's stance counts in its vote space, or null until they are known. */
  countsFor: (claimId: string) => ResponseCounts | null;
  /** What to call a row's split bar: the page's own label in its space, else the vote space's name. */
  labelFor: (spaceId: string, pageSpaceLabel: string) => string;
};

/**
 * Split the rows into those the page's one batch answers and those read in their own space.
 * Exact id match only: the batch primes cache entries under the page's id as written, and the
 * row's pills read under the row's, so a differently written id has to read for itself.
 */
export function partitionVoteCountTargets(targets: readonly ClaimVoteCountTarget[], pageSpaceId: string) {
  const byClaim = new Map<string, ClaimVoteCountTarget>();
  for (const target of targets) {
    if (!target.claimId || !target.spaceId) continue;
    const hex = ID.uuidToHex(target.claimId);
    if (!byClaim.has(hex)) byClaim.set(hex, target);
  }
  const all = [...byClaim.values()];
  return {
    all,
    batched: all.filter(target => target.spaceId === pageSpaceId),
    ownReads: all.filter(target => target.spaceId !== pageSpaceId),
  };
}

/**
 * Agree / Disagree counts for a template's claim rows, each in the space the row votes in (GEO-3819).
 *
 * A row's pills read `entityResponseCountsQueryKey` for its own vote space. Reading the split bar and
 * "N votes" from those same entries keeps the three in step: a claim from another space no longer
 * draws the page space's numbers beside pills that show its own. Rows in the page's space are primed
 * by one batch, as before; a row from another space reads its own entry, the request its pills make
 * anyway. A vote's read-back refreshes these entries, so the bar follows a vote once it lands.
 */
export function useTemplateClaimVoteCounts({
  pageSpaceId,
  targets,
}: {
  pageSpaceId: string;
  targets: readonly ClaimVoteCountTarget[];
}): TemplateClaimVoteCounts {
  const signature = targets.map(target => `${target.claimId}|${target.spaceId}`).join(',');
  const { all, batched, ownReads } = React.useMemo(
    () => partitionVoteCountTargets(targets, pageSpaceId),
    // Keyed on the contents: adapters build a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, pageSpaceId]
  );

  const batchTargets = React.useMemo(
    () => batched.map(target => ({ entityId: target.claimId, responseKind: 'stance' as const })),
    [batched]
  );
  useClaimResponseSummaryBatch({ spaceId: pageSpaceId, targets: batchTargets, enabled: batchTargets.length > 0 });

  const ownReadKeys = React.useMemo(
    () => new Set(ownReads.map(target => `${target.claimId}|${target.spaceId}`)),
    [ownReads]
  );

  const combine = React.useCallback(
    (results: Array<{ data?: ResponseCounts | null }>) => {
      const counts = new Map<string, ResponseCounts | null>();
      all.forEach((target, index) => {
        const data = results[index]?.data;
        counts.set(ID.uuidToHex(target.claimId), data === undefined ? null : (data ?? { positive: 0, negative: 0 }));
      });
      return counts;
    },
    [all]
  );

  const countsByClaim = useQueries({
    queries: all.map(target => ({
      queryKey: entityResponseCountsQueryKey(target.claimId, target.spaceId, CLAIM_RESPONSE_OBJECT_TYPE, 'stance'),
      // The same read `useClaimResponseSummary` makes for the row's pills, so the two share it.
      queryFn: () =>
        Effect.runPromise(
          getEntityResponseCounts(target.claimId, target.spaceId, 'stance', CLAIM_RESPONSE_OBJECT_TYPE)
        ),
      // The page's batch primes its own rows' entries; only the others read here.
      enabled: ownReadKeys.has(`${target.claimId}|${target.spaceId}`),
      staleTime: 30_000,
    })),
    combine,
  });

  const otherSpaceIds = React.useMemo(() => [...new Set(ownReads.map(target => target.spaceId))], [ownReads]);
  const { spaces } = useSpacesByIds(otherSpaceIds);

  return React.useMemo(() => {
    const nameByHex = new Map<string, string>();
    for (const space of spaces) {
      const name = space.entity?.name?.trim();
      if (name) nameByHex.set(ID.uuidToHex(space.id), name);
    }
    return {
      countsFor: claimId => countsByClaim.get(ID.uuidToHex(claimId)) ?? null,
      labelFor: (spaceId, pageSpaceLabel) =>
        spaceId === pageSpaceId ? pageSpaceLabel : (nameByHex.get(ID.uuidToHex(spaceId)) ?? 'Everyone'),
    };
  }, [countsByClaim, pageSpaceId, spaces]);
}
