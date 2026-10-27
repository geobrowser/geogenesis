'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { type QueryClient, useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

import { CLAIM_ACTIVITY_COUNT_FIELDS, type ClaimActivityCount, countActivityForNode } from './claim-activity-fields';

// Deliberately not re-exported from here. `claim-activity-fields` is a server-safe module on
// purpose: the explore feed assembles its card selection on the server, and importing these through
// this `'use client'` module turns them into client-reference proxies at build time — the fields
// interpolate to nothing and the query fails to parse. A convenience re-export is a working import
// path to that failure, so the split is only real if this file does not offer one. Import from
// `./claim-activity-fields`.

/**
 * Activity totals for a set of claims, in one request.
 *
 * Explore cards get this for free — their own selection carries the fields, and what the number
 * means lives in `claim-activity-fields.ts`. This is for surfaces holding a claim id with no card
 * behind it, the claim page's own heading above all.
 *
 * Batched because the cost is per request rather than per claim, and a feed asking once per row is
 * what makes a number on a row expensive: 20 active claims answer together in 0.69s and 17 KB.
 *
 * The selection is the shared one rather than a second copy of it. It used to be written out again
 * here with the ontology ids as variables, which is how the two drifted: the nested-list cap was
 * fixed in one place and the card kept reading the truncated shape. One string, one set of limits.
 */
const CLAIM_ACTIVITY_COUNTS_SOURCE = /* GraphQL */ `
  query ClaimActivityCounts($ids: [UUID!]) {
    entities(filter: { id: { in: $ids } }) {
      id
      ${CLAIM_ACTIVITY_COUNT_FIELDS}
    }
  }
`;

const claimActivityCountsDocument = parse(CLAIM_ACTIVITY_COUNTS_SOURCE) as TypedDocumentNode<any, any>;

// Only `id` is read here by name; the counting fields are whatever `countActivityForNode`
// recognises, so the shape stays open rather than restating them in two places.
type CountsResponse = { entities?: Array<({ id?: string | null } & Record<string, unknown>) | null> | null };

const EMPTY_COUNTS = new Map<string, ClaimActivityCount>();

export function decodeClaimActivityCounts(data: CountsResponse): Map<string, ClaimActivityCount> {
  const counts = new Map<string, ClaimActivityCount>();

  for (const claim of data.entities ?? []) {
    if (!claim?.id) continue;
    counts.set(uuidToHex(claim.id), countActivityForNode(claim));
  }

  return counts;
}

export const claimActivityCountsQueryKey = (ids: string[]) => ['claim-activity-counts', ids] as const;

/**
 * Activity totals keyed by canonical claim id.
 *
 * An absent entry means "not answered yet", not "nothing" — a caller showing a number should hold
 * whatever it already had rather than flashing a zero it invented.
 */
export function useClaimActivityCounts(
  claimIds: string[],
  enabled = true
): {
  counts: Map<string, ClaimActivityCount>;
  /**
   * The read failed, so an absent entry is not "not answered yet" — nothing is coming.
   *
   * It used to return the map alone, and a caller could not tell the two apart. The claim page reads
   * `?.total` and falls back to its own comments plus debate rows when that is undefined, which is a
   * number that leaves out every extracted claim and every comment nested under a debate — presented,
   * silently and permanently, as the Activity total.
   */
  error: Error | null;
  retry: () => void;
} {
  // Sorted and deduped, so the same claims in a different order are the same query.
  const ids = React.useMemo(() => [...new Set(claimIds.filter(Boolean).map(uuidToHex))].sort(), [claimIds]);

  const { data, error, refetch } = useQuery({
    queryKey: claimActivityCountsQueryKey(ids),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: claimActivityCountsDocument,
          decoder: decodeClaimActivityCounts,
          variables: { ids },
          signal,
        })
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    // Not on focus. A reader's own comment is counted by adjusting this cache
    // ({@link adjustClaimActivityTotal}), and a refetch replaces that adjustment with whatever the
    // server says — which, if the indexer has not caught up, is a number without their comment in
    // it. Returning to a tab is not a moment to take someone's comment back out of the count. A
    // remount past `staleTime` does re-read, and by then the indexer has had a minute.
    refetchOnWindowFocus: false,
  });

  const retry = React.useCallback(() => void refetch(), [refetch]);

  return React.useMemo(
    () => ({ counts: data ?? EMPTY_COUNTS, error: (error as Error | null) ?? null, retry }),
    [data, error, retry]
  );
}

/**
 * Count a comment the reader just published, or take one back that failed.
 *
 * The heading over the claim's activity is this aggregate: the claim's debates, the claims extracted
 * from them, and every comment anywhere in that tree. Nothing in the comment caches can move it, so
 * publishing used to leave the number standing still — the aggregate answered before the comment
 * existed.
 *
 * The adjustment goes into the query cache rather than into the section's own state, which is where
 * the previous version of this kept it. Two things followed from that and both were wrong. React
 * Query holds this answer for `staleTime`, so a reader who posted, navigated away and came back
 * inside the minute got the pre-publish aggregate with a delta that had reset to zero — the heading
 * dropped their comment while the comment sat in the list below it. And the state outlived the
 * claim: `EntityPageBody` is reused between records, so walking to another claim carried the delta
 * onto a number it had nothing to do with. The cache is keyed by claim, and it is the same thing
 * whose lifetime the baseline already has.
 *
 * Signed, because a publish can fail: `useCreateComment` drops the optimistic row when the
 * transaction is rejected, and the count has to give back what it counted. A publish merely
 * *retained* for retry keeps its row, so it keeps its count.
 *
 * A claim with no entry yet is left alone rather than invented — neither written nor cancelled, so the
 * request that is still out answers for itself. That loses a comment published in the few hundred
 * milliseconds before the first response lands, which is not long enough to write one, and is a far
 * better trade than aborting the only request that was going to produce a number at all.
 *
 * Asynchronous because it cancels before it writes, which is React Query's own recipe for an
 * optimistic update and the only thing that closes this race: a refetch already on its way — the one
 * a mount past `staleTime` starts, or a reconnect — answers with a number from before the comment
 * existed, and if it lands *after* the write it puts that number back. Timestamps cannot tell the two
 * apart, because the response was requested before the publish and arrives after it. Cancelling makes
 * it never arrive. Callers do not await this; the write lands a microtask later, which is not a
 * perceptible delay in a heading.
 */
export async function adjustClaimActivityTotal(
  queryClient: QueryClient,
  claimId: string,
  delta: number
): Promise<void> {
  if (delta === 0) return;
  const id = uuidToHex(claimId);

  // Every cached set that *already answered* for this claim — which is both what the write can adjust
  // and, exactly, what the cancel is allowed to touch.
  //
  // Matching on the key alone was wrong in a way that mattered more than the race it was fixing: a
  // comment published while the very first request was still out aborted that request, and then the
  // write bailed because there was no entry to adjust. Nothing was left to answer, so the heading sat
  // on its incomplete fallback until something else happened to refetch. A query with no baseline has
  // nothing to overwrite, so there is no race to cancel — it is left alone to answer for itself, which
  // is what this comment used to claim happened.
  const holdsABaseline = {
    queryKey: ['claim-activity-counts'] as const,
    predicate: (query: { queryKey: readonly unknown[]; state: { data?: unknown } }) => {
      const ids = query.queryKey[1];
      if (!Array.isArray(ids) || !ids.includes(id)) return false;
      return (query.state.data as Map<string, ClaimActivityCount> | undefined)?.get(id) != null;
    },
  };

  await queryClient.cancelQueries(holdsABaseline);

  queryClient.setQueriesData<Map<string, ClaimActivityCount>>(holdsABaseline, counts => {
    const current = counts?.get(id);
    // `undefined` bails out of the update rather than writing anything, so a cached set that does
    // not hold this claim — or one that has not answered yet — is left untouched instead of being
    // re-set to itself and waking its subscribers.
    if (current == null) return undefined;
    const next = new Map(counts);
    next.set(id, { ...current, total: Math.max(0, current.total + delta) });
    return next;
  });
}
