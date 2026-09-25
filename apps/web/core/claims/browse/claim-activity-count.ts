'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

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
export function useClaimActivityCounts(claimIds: string[], enabled = true): Map<string, ClaimActivityCount> {
  // Sorted and deduped, so the same claims in a different order are the same query.
  const ids = React.useMemo(() => [...new Set(claimIds.filter(Boolean).map(uuidToHex))].sort(), [claimIds]);

  const { data } = useQuery({
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
  });

  return data ?? EMPTY_COUNTS;
}
