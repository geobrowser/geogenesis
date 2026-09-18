'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

/**
 * The two numbers a record can rank by, for entities the caller already has (GEO-2918).
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
 * **Score** is the claim's own visible number — a property. Sparse in general
 * but not here: 66 of the 68 debates in the graph carry one, and the two that do
 * not sort last rather than vanishing.
 *
 * **Ranking score** is the indexer's, and it is a column on the entity rather
 * than a property — the same number Explore orders Best by. Every entity has
 * one, so unlike Score it needs no fallback. Both come back in one request
 * because they are read together and asking twice for one list would be two
 * cache entries describing the same rows.
 */
const SCORES_SOURCE = /* GraphQL */ `
  query EntityScores($ids: [UUID!], $propertyId: UUID!) {
    entitiesConnection(filter: { id: { in: $ids } }, first: 100) {
      nodes {
        id
        rankingScore
        valuesList(filter: { propertyId: { is: $propertyId } }) {
          integer
        }
      }
    }
  }
`;

export const entityScoresDocument = parse(SCORES_SOURCE) as TypedDocumentNode<any, any>;

/**
 * Ids per request. A longer list is chunked, not cut.
 *
 * It used to slice, which is the same silent truncation
 * `fetchExploreRowsByIds` had — and it came from the same list. The debate ids
 * flow to *two* places, and chunking only the one this review pointed at left
 * the other one scoring the first hundred and calling the rest unscored, which
 * `sortRows` then pushes behind every scored row. So Top would have put a
 * profile's 101st debate last regardless of how high it scored.
 */
const ID_BATCH_SIZE = 100;

type ScoreNode = {
  id?: string | null;
  rankingScore?: number | string | null;
  valuesList?: ({ integer?: number | string | null } | null)[] | null;
};

type ScoresResponse = { entitiesConnection?: { nodes?: (ScoreNode | null)[] | null } | null };

export type EntityScores = {
  /** The Score property. Absent for an entity that carries none. */
  scores: Map<string, number>;
  /** The indexer's ranking score. Present for every entity. */
  rankings: Map<string, number>;
};

/**
 * Both numbers arrive as strings and both have to be coerced.
 *
 * `integer` is a GraphQL Int delivered as a decimal string, and sorting those
 * lexicographically puts "9" above "15". `rankingScore` is a numeric with 22
 * decimal places — far past what a double holds, but the values that matter
 * differ in the fourth (17901.8249 against 17901.5235) against a magnitude of
 * 1.8e4, so a double separates them with room to spare. Ties keep their incoming
 * order, so any that did collide would read as the list they came from.
 */
export function decodeScores(response: ScoresResponse): EntityScores {
  const scores = new Map<string, number>();
  const rankings = new Map<string, number>();

  for (const node of response.entitiesConnection?.nodes ?? []) {
    if (!node?.id) continue;
    const key = normId(node.id);

    const raw = node.valuesList?.[0]?.integer;
    if (raw !== null && raw !== undefined) {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(value)) scores.set(key, value);
    }

    const rank = node.rankingScore;
    if (rank !== null && rank !== undefined) {
      const value = typeof rank === 'number' ? rank : Number(rank);
      if (Number.isFinite(value)) rankings.set(key, value);
    }
  }

  return { scores, rankings };
}

export function entityScoresQueryKey(ids: readonly string[]) {
  // Sorted, so the same set asked for in two orders is one cache entry.
  return ['entity-scores', [...ids].map(normId).sort().join(',')] as const;
}

const NO_SCORES: EntityScores = { scores: new Map(), rankings: new Map() };

export function useEntityScores({ ids, enabled = true }: { ids: readonly string[]; enabled?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: entityScoresQueryKey(ids),
    enabled: enabled && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<EntityScores> => {
      const scores = new Map<string, number>();
      const rankings = new Map<string, number>();

      for (let start = 0; start < ids.length; start += ID_BATCH_SIZE) {
        const chunk = ids.slice(start, start + ID_BATCH_SIZE);

        const page = await Effect.runPromise(
          graphql({
            query: entityScoresDocument,
            decoder: decodeScores,
            variables: { ids: chunk, propertyId: SCORE_SYSTEM_PROPERTY },
            signal,
          })
        );

        for (const [id, score] of page.scores) scores.set(id, score);
        for (const [id, rank] of page.rankings) rankings.set(id, rank);
      }

      return { scores, rankings };
    },
  });

  // `isError` matters because the empty map is indistinguishable from the
  // loading one, and `sortRows` treats "no scores" as "keep the incoming order".
  // A caller that ignores it therefore shows the New order under a menu that
  // says Top or Best, permanently and silently.
  const { scores, rankings } = data ?? NO_SCORES;

  return { scores, rankings, isLoading, isError };
}
