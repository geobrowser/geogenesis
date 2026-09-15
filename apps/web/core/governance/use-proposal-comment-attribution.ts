'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSpaceMemberIds } from '~/core/hooks/use-space-editor-ids';
import { proposalCommentVotesQueryKey } from '~/core/io/query-keys';
import { fetchProposal } from '~/core/io/subgraph/fetch-proposal';

import { useOptimisticVoteChoice } from '~/partials/governance/optimistic-voted-atom';

import { type ProposalCommentAttribution, proposalCommentAttribution } from './proposal-comment-attribution';

const EMPTY_ATTRIBUTION: Map<string, ProposalCommentAttribution> = new Map();

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
 *
 * `editorSpaceIds` is passed in because the comments section already has it: it asks who among the
 * comment authors is an editor in order to offer the "editors only" filter, so asking again here
 * would be the same requests twice. Membership is asked for here instead of there, because only this
 * badge needs it.
 */
export function useProposalCommentAttribution({
  entityId,
  spaceId,
  authorSpaceIds,
  editorSpaceIds,
  isLoadingEditors,
  enabled,
}: {
  entityId: string | null;
  /** The space the comments section is reading, which for a proposal entity is the proposal's own. */
  spaceId: string;
  /** The personal spaces of everyone who has commented — who the badges are actually about. */
  authorSpaceIds: string[];
  editorSpaceIds: ReadonlySet<string>;
  /** Whether that editor lookup is still in flight — see the hold below. */
  isLoadingEditors: boolean;
  enabled: boolean;
}): Map<string, ProposalCommentAttribution> {
  const { data: proposal } = useQuery({
    queryKey: proposalCommentVotesQueryKey(entityId ?? ''),
    enabled: enabled && Boolean(entityId),
    queryFn: async ({ signal }) => {
      const found = await fetchProposal({ id: entityId!, signal });
      // Not a proposal — or one the API will not answer for. Either way there is nothing to say
      // about the people commenting on it, and `null` is what says that.
      if (!found) return null;

      return {
        spaceId: found.space.id,
        // `accountId` is the voter's personal space id, despite the name — see `SubstreamVote`.
        // Already the internal vocabulary: `fetchProposal` runs the wire value through
        // `convertVoteOption`, so these are ACCEPT / REJECT / ABSTAIN.
        votes: found.proposalVotes.nodes.map(node => ({ voterSpaceId: node.accountId, vote: node.vote })),
      };
    },
  });

  // Keyed on the proposal's own space, which is only known once the fetch above answers — so an
  // entity that is not a proposal asks nothing, and every other surface that renders comments pays
  // nothing for a lookup only this badge wants.
  const { memberSpaceIds, isLoading: isLoadingMembers } = useSpaceMemberIds(proposal?.spaceId ?? '', authorSpaceIds);

  // The vote the reader just cast, before the chain and the indexer have caught up. `AcceptOrReject`
  // invalidates the query above on success, but that is a round trip away; this is the same
  // optimistic record the governance list uses to sink a card the moment it is voted on.
  const optimisticVote = useOptimisticVoteChoice(entityId ?? '');
  const { personalSpaceId } = usePersonalSpaceId();

  // The editor set was gathered against the caller's space. For a proposal entity that is the
  // proposal's own space, which is the premise this feature rests on — but if the two ever disagree,
  // those ids answer a question about a different space. Say nothing rather than badge someone with
  // a role they may not hold here.
  const editorsMatchProposalSpace = proposal ? normalizeSpaceId(proposal.spaceId) === normalizeSpaceId(spaceId) : false;

  return React.useMemo(() => {
    if (!proposal) return EMPTY_ATTRIBUTION;

    // Nothing is drawn until both role lookups have answered. They resolve independently of the
    // votes, so drawing early means a voter reads as a bare "Rejected" and then becomes "Editor ·
    // Rejected" a beat later — the page correcting itself about a person, which is the failure this
    // badge is supposed to avoid. An absent badge is honest; a half-built one is not.
    if (isLoadingEditors || isLoadingMembers) return EMPTY_ATTRIBUTION;

    const votes =
      optimisticVote && personalSpaceId
        ? [
            ...proposal.votes.filter(v => normalizeSpaceId(v.voterSpaceId) !== normalizeSpaceId(personalSpaceId)),
            { voterSpaceId: personalSpaceId, vote: optimisticVote },
          ]
        : proposal.votes;

    return proposalCommentAttribution({
      votes,
      editorSpaceIds: editorsMatchProposalSpace ? editorSpaceIds : [],
      memberSpaceIds,
    });
  }, [
    proposal,
    editorsMatchProposalSpace,
    editorSpaceIds,
    memberSpaceIds,
    isLoadingEditors,
    isLoadingMembers,
    optimisticVote,
    personalSpaceId,
  ]);
}
