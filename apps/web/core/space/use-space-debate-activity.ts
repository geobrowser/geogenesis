'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import type { ExploreFeedResult } from '~/core/explore/fetch-explore-feed';
import { graphql } from '~/core/io/graphql-client';

import {
  NO_SPACE_DEBATE_ACTIVITY_COUNTS,
  SPACE_ACTIVITY_TYPE_ID,
  SPACE_DEBATE_ACTIVITY_COUNTS_QUERY,
  type SpaceActivityKind,
  type SpaceDebateActivityCounts,
  type SpaceDebateActivityCountsResult,
  decodeSpaceDebateActivityCounts,
  spaceActivityFeedEndpoint,
  spaceDebateActivityCountsVariables,
} from './space-debate-activity';

const countsDocument = parse(SPACE_DEBATE_ACTIVITY_COUNTS_QUERY) as TypedDocumentNode<any, any>;

/**
 * None of this moves on anything a reader does on the page, and the Overview card asks for all of
 * it on every visit. A minute is what the profile's equivalent counts hold for, and for the same
 * reason.
 */
const SPACE_ACTIVITY_STALE_TIME = 60_000;

/**
 * Whether this space is set up for debates at all.
 *
 * "Set up for debates" is exactly "the acceptor service account edits it": a finished debate is
 * published into the claim's home space by that account, and publishing needs editor rights there
 * — a member can propose but not execute, so anything else reverts on-chain. `/api/debates/
 * publishable-spaces` resolves that list server-side (the acceptor's identity stays server-only),
 * and it is the same list the publish sweep discovers its work from.
 *
 * `isSpaceDebatePublishable` fails *open* when the list is unknown — no acceptor configured, or the
 * lookup failed — and that is the right way round here too. The card is additionally gated on there
 * being debate activity to show, so failing open can at worst reveal a section on a space that
 * genuinely holds debates and claims; failing closed would hide it across every preview and local
 * environment, which run with no acceptor at all.
 */
export function useSpaceDebateEligibility(spaceId: string): { isEligible: boolean; isLoading: boolean } {
  const { publishableSpaceIds, isLoading } = useDebatePublishableSpaces();
  return {
    isEligible: isSpaceDebatePublishable(spaceId, publishableSpaceIds),
    isLoading,
  };
}

/**
 * How many debates and debate-tagged claims this space holds.
 *
 * Its own request rather than something derived from the rows below, because the rows are one page
 * and the pill beside them states a total — the mistake the profile card documents as "the claims
 * gallery read 20 where the rail beside it said 192".
 */
export function useSpaceDebateActivityCounts(
  spaceId: string,
  enabled: boolean
): { counts: SpaceDebateActivityCounts; isLoading: boolean; isError: boolean } {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['space-debate-activity-counts', spaceId] as const,
    enabled: enabled && spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: countsDocument,
          decoder: (result: SpaceDebateActivityCountsResult) => decodeSpaceDebateActivityCounts(result),
          variables: spaceDebateActivityCountsVariables(spaceId),
          signal,
        })
      ),
  });

  return {
    counts: data ?? NO_SPACE_DEBATE_ACTIVITY_COUNTS,
    isLoading: enabled && isLoading,
    isError,
  };
}

/**
 * The first page of one kind, in the order its full-screen feed opens on.
 *
 * Fetched through the same endpoint that feed uses, with the same sort, so "See all debates" leads
 * to the same rows in the same order rather than to a second ranking that happens to look similar.
 * The card renders six of them; the page size is whatever the feed serves, and slicing is the
 * gallery's job.
 */
export function useSpaceActivityRows(spaceId: string, kind: SpaceActivityKind, enabled: boolean) {
  const endpoint = spaceActivityFeedEndpoint(spaceId);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['space-debate-activity-rows', spaceId, kind] as const,
    enabled: enabled && spaceId !== '',
    staleTime: SPACE_ACTIVITY_STALE_TIME,
    queryFn: async ({ signal }): Promise<ExploreFeedResult> => {
      // `typeIds` and `sort`, the same two parameters the full-screen feed sends for this kind, so
      // both read one endpoint with one contract rather than the card having a private shortcut.
      const params = new URLSearchParams({ typeIds: SPACE_ACTIVITY_TYPE_ID[kind], sort: 'best' });
      const response = await fetch(`${endpoint}?${params.toString()}`, { credentials: 'include', signal });
      // Thrown rather than swallowed into an empty page: an empty feed and a failed one look
      // identical on screen and mean opposite things, and the card draws them differently.
      if (!response.ok) throw new Error(`space activity ${kind}: ${response.status}`);
      return (await response.json()) as ExploreFeedResult;
    },
    retry: 2,
    retryDelay: attempt => Math.min(1_000 * 2 ** attempt, 5_000),
  });

  const rows = React.useMemo(() => data?.items ?? [], [data?.items]);

  return { rows, isLoading: enabled && isLoading, isError };
}
