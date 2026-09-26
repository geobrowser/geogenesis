'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { BatchedCounts } from '~/core/hooks/batched-counts';
import { batchedCounts } from '~/core/hooks/batched-counts';
import { uuidToHex } from '~/core/id/normalize';
import { graphql } from '~/core/io/graphql-client';

/**
 * How many claims each of a set of debates produced, in one request.
 *
 * The claim page's activity feed wants this number beside each debate's comment count. Reading it
 * from the transcript — which is what draws the claims themselves — costs a transcript fetch per
 * debate row *whether or not the row is expanded*, so collapsing a debate stopped saving anything.
 * The published `Sources` relation answers the same question as a server-side aggregate: measured
 * against testnet on 2026-09-25, the two agree on 27 of 27 debates, which is every debate attached
 * to the fifteen busiest claims.
 *
 * Batched for the same reason `useEntityCommentCounts` is: the cost is per request rather than per
 * debate, and a feed asking once per row is what makes a number on a row expensive.
 */
const DEBATE_CLAIM_COUNTS_SOURCE = /* GraphQL */ `
  query DebateClaimCounts($ids: [UUID!], $sourcesPropertyId: UUID!, $claimTypeId: UUID!) {
    entities(filter: { id: { in: $ids } }) {
      id
      extracted: backlinks(
        filter: { typeId: { is: $sourcesPropertyId }, fromEntity: { typeIds: { overlaps: [$claimTypeId] } } }
      ) {
        totalCount
      }
    }
  }
`;

const debateClaimCountsDocument = parse(DEBATE_CLAIM_COUNTS_SOURCE) as TypedDocumentNode<any, any>;

type CountsResponse = {
  entities?: Array<{ id?: string | null; extracted?: { totalCount?: number | null } | null } | null> | null;
};

export function decodeDebateClaimCounts(data: CountsResponse): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entity of data.entities ?? []) {
    if (!entity?.id) continue;
    counts.set(uuidToHex(entity.id), entity.extracted?.totalCount ?? 0);
  }
  return counts;
}

export const debateClaimCountsQueryKey = (ids: string[]) => ['debate-claim-counts', ids] as const;

/**
 * Extracted-claim counts for a set of debates, read through {@link countFor}.
 *
 * Absent means "not answered yet", not zero, and a failed request says so — see
 * {@link BatchedCounts}. A row that hides its branch on a zero would otherwise lose every claim the
 * debate produced whenever this one request failed.
 */
export function useDebateClaimCounts(debateIds: string[], enabled = true): BatchedCounts {
  // Sorted and deduped, so the same debates in a different order are the same query.
  const ids = React.useMemo(() => [...new Set(debateIds.filter(Boolean).map(uuidToHex))].sort(), [debateIds]);

  const { data, isError } = useQuery({
    queryKey: debateClaimCountsQueryKey(ids),
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: debateClaimCountsDocument,
          decoder: decodeDebateClaimCounts,
          variables: { ids, sourcesPropertyId: SOURCES_PROPERTY_ID, claimTypeId: CLAIM_TYPE_ID },
          signal,
        })
      ),
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
  });

  // Memoized for the same reason the comment counts are: this lands in a `useMemo` dependency list.
  return React.useMemo(() => batchedCounts(data, isError), [data, isError]);
}
