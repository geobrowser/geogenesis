'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect, Either } from 'effect';

import { Environment } from '~/core/environment';
import { ID } from '~/core/id';
import { graphql } from '~/core/io/subgraph/graphql';
import { normId } from '~/core/utils/norm-id';

/**
 * The spaces a person has proposed into, with how many times (GEO-2918).
 *
 * One column over the whole record, which is what makes the menu honest: 770
 * proposals across 30 spaces on the reference account, and a menu built from the
 * twenty rows on screen would offer three of those thirty. Two requests at
 * `first: 500`, selecting nothing but the space.
 *
 * Separate from the list query rather than derived from it, for the same reason
 * the Positions index is separate — a facet over a page describes the page.
 */
const SPACE_FACET_PAGE_SIZE = 500;

/** Bounds the request count, not the answer. 20 pages is 10,000 proposals. */
const SPACE_FACET_MAX_PAGES = 20;

export type ProposalSpaceFacet = {
  id: string;
  count: number;
};

function spacesQuery(spaceId: string, after: string | null) {
  const sp = JSON.stringify(ID.hexToUuid(spaceId));
  const cursor = after ? `, after: ${JSON.stringify(after)}` : '';

  return `query {
    proposalsCurrentsConnection(
      filter: { proposedBy: { is: ${sp} } }
      orderBy: CREATED_AT_DESC
      first: ${SPACE_FACET_PAGE_SIZE}${cursor}
    ) {
      pageInfo { hasNextPage endCursor }
      nodes { spaceId }
    }
  }`;
}

type SpacesResult = {
  proposalsCurrentsConnection: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null } | null;
    nodes: { spaceId: string | null }[];
  } | null;
};

export function personProposalSpacesQueryKey(spaceId: string) {
  return ['person-proposal-spaces', ID.uuidToHex(spaceId)] as const;
}

export function usePersonProposalSpaces({ spaceId, enabled = true }: { spaceId: string; enabled?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: personProposalSpacesQueryKey(spaceId),
    enabled: enabled && spaceId !== '',
    // Held longer than the list: this changes when the person proposes, which
    // is not something the reader of their profile does.
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<ProposalSpaceFacet[]> => {
      const counts = new Map<string, number>();
      let after: string | null = null;

      for (let page = 0; page < SPACE_FACET_MAX_PAGES; page++) {
        // Annotated because `after` is assigned from it below, and the loop's
        // own inference would otherwise chase its tail.
        const result: Either.Either<SpacesResult, unknown> = await Effect.runPromise(
          Effect.either(
            graphql<SpacesResult>({
              query: spacesQuery(spaceId, after),
              endpoint: Environment.getConfig().api,
              signal,
            })
          )
        );

        if (Either.isLeft(result)) {
          // All or nothing, not the pages that made it. Breaking out here left
          // the counts understated — 770 proposals across 30 spaces reported as
          // whatever the first page happened to hold — and a wrong number in a
          // menu is worse than no menu, because the reader cannot tell.
          //
          // Thrown rather than answered empty so `isError` is true and the
          // caller can drop the dimension instead of drawing an empty one.
          console.error(`[proposal-spaces] failed for ${spaceId}:`, result.left);
          throw result.left;
        }

        const connection: SpacesResult['proposalsCurrentsConnection'] = result.right.proposalsCurrentsConnection;
        for (const node of connection?.nodes ?? []) {
          if (!node.spaceId) continue;
          const key = normId(node.spaceId);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }

        if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
        after = connection.pageInfo.endCursor;

        // The ceiling is 10,000 proposals, fifteen times the busiest account.
        // Reaching it would understate the counts the same way a failed page
        // does, so it is an error rather than a quiet truncation.
        if (page === SPACE_FACET_MAX_PAGES - 1) {
          throw new Error(`[proposal-spaces] ${spaceId} exceeds ${SPACE_FACET_MAX_PAGES} pages`);
        }
      }

      return [...counts.entries()]
        .map(([id, count]) => ({ id, count }))
        .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
    },
  });

  return { spaces: data ?? EMPTY_FACETS, isLoading, isError };
}

const EMPTY_FACETS: ProposalSpaceFacet[] = [];
