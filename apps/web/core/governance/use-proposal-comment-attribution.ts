'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { getSpaceEditorsPage, getSpaceMembersPage } from '~/core/io/queries';
import { fetchProposal } from '~/core/io/subgraph/fetch-proposal';

import { type ProposalCommentAttribution, proposalCommentAttribution } from './proposal-comment-attribution';

/**
 * A page of a space's editors or members. The API caps these at 100 and the gap matters: a space
 * with more than that would badge only the first page and silently leave the rest unlabelled, which
 * reads as "not an editor" rather than as an absence. Paged until exhausted, capped so a
 * pathological space cannot spend requests without bound — past which the badge is simply absent,
 * which is the honest failure.
 */
const PARTICIPANTS_PAGE_SIZE = 100;
const MAX_PARTICIPANT_PAGES = 10;

const EMPTY_ATTRIBUTION: Map<string, ProposalCommentAttribution> = new Map();

async function fetchAllParticipants(
  spaceId: string,
  page: (
    spaceId: string,
    args: { first: number; offset: number },
    signal?: AbortController['signal']
  ) => ReturnType<typeof getSpaceEditorsPage>,
  signal?: AbortController['signal']
): Promise<string[]> {
  const ids: string[] = [];

  for (let index = 0; index < MAX_PARTICIPANT_PAGES; index += 1) {
    const result = await Effect.runPromise(
      page(spaceId, { first: PARTICIPANTS_PAGE_SIZE, offset: index * PARTICIPANTS_PAGE_SIZE }, signal)
    );
    ids.push(...result.memberSpaceIds);
    if (ids.length >= result.totalCount || result.memberSpaceIds.length === 0) break;
  }

  return ids;
}

/**
 * Who is speaking on a proposal, keyed by personal space id, for badging its comments (GEO-2907).
 *
 * Takes the entity being commented on rather than a proposal, because that is all the comments panel
 * knows — and every proposal has a system entity at its own id, in its own space, so the two are the
 * same thing. An entity that is not a proposal answers with an empty map, exactly as the debate vote
 * badge does for an entity that is not a debate.
 *
 * Read live rather than recorded on the comment. Both halves change after a comment is written — an
 * editor votes, an editor is removed — and the badge is a statement about where that person stands
 * now, which is what a reader weighing the comment wants. Snapshotting would mean writing role and
 * vote onto the comment at publish time, which is a different feature.
 */
export function useProposalCommentAttribution(
  entityId: string | null,
  enabled: boolean
): Map<string, ProposalCommentAttribution> {
  const { data } = useQuery({
    queryKey: ['proposal-comment-attribution', entityId ?? ''],
    enabled: enabled && Boolean(entityId),
    queryFn: async ({ signal }) => {
      const proposal = await fetchProposal({ id: entityId! });
      // Not a proposal — or one the API will not answer for. Either way there is nothing to say
      // about the people commenting on it, and an empty map is what says that.
      if (!proposal) return null;

      const [editorSpaceIds, memberSpaceIds] = await Promise.all([
        fetchAllParticipants(proposal.space.id, getSpaceEditorsPage, signal),
        fetchAllParticipants(proposal.space.id, getSpaceMembersPage, signal),
      ]);

      return {
        // `accountId` is the voter's personal space id, despite the name — see `SubstreamVote`.
        votes: proposal.proposalVotes.nodes.map(node => ({ voterSpaceId: node.accountId, vote: node.vote })),
        editorSpaceIds,
        memberSpaceIds,
      };
    },
  });

  return React.useMemo(() => (data ? proposalCommentAttribution(data) : EMPTY_ATTRIBUTION), [data]);
}
