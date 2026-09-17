'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

/**
 * The Score property, for a handful of entities the caller already has (GEO-2918).
 *
 * The explore card does not carry a score — Explore's own Top sort comes from
 * `entitiesOrderedByPropertyConnection`, which orders rows rather than
 * decorating them — so a list that is already complete in memory has no way to
 * rank itself without asking.
 *
 * Only worth doing for a list that is *small* and *whole*, which on these tabs
 * means Debates: eleven rows at the top of the graph, arriving in one request.
 * Positions goes the other way and lets the server order it, because its list is
 * genuinely paged.
 *
 * Score is sparse in general but not here: 66 of the 68 debates in the graph
 * carry one. The two that do not sort last rather than vanishing.
 */
const SCORES_SOURCE = /* GraphQL */ `
  query EntityScores($ids: [UUID!], $propertyId: UUID!) {
    entitiesConnection(filter: { id: { in: $ids } }, first: 100) {
      nodes {
        id
        valuesList(filter: { propertyId: { is: $propertyId } }) {
          integer
        }
      }
    }
  }
`;

export const entityScoresDocument = parse(SCORES_SOURCE) as TypedDocumentNode<any, any>;

/** How many ids one request covers. Above this the caller wants a server-ordered list. */
const MAX_IDS = 100;

type ScoresResponse = {
  entitiesConnection?: {
    nodes?:
      ({ id?: string | null; valuesList?: ({ integer?: number | string | null } | null)[] | null } | null)[] | null;
  } | null;
};

export function decodeScores(response: ScoresResponse): Map<string, number> {
  const scores = new Map<string, number>();

  for (const node of response.entitiesConnection?.nodes ?? []) {
    if (!node?.id) continue;
    const raw = node.valuesList?.[0]?.integer;
    if (raw === null || raw === undefined) continue;

    const value = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(value)) scores.set(normId(node.id), value);
  }

  return scores;
}

export function entityScoresQueryKey(ids: readonly string[]) {
  // Sorted, so the same set asked for in two orders is one cache entry.
  return ['entity-scores', [...ids].map(normId).sort().join(',')] as const;
}

const NO_SCORES = new Map<string, number>();

export function useEntityScores({ ids, enabled = true }: { ids: readonly string[]; enabled?: boolean }) {
  const capped = ids.slice(0, MAX_IDS);

  const { data, isLoading } = useQuery({
    queryKey: entityScoresQueryKey(capped),
    enabled: enabled && capped.length > 0,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: entityScoresDocument,
          decoder: decodeScores,
          variables: { ids: capped, propertyId: SCORE_SYSTEM_PROPERTY },
          signal,
        })
      ),
  });

  return { scores: data ?? NO_SCORES, isLoading };
}
