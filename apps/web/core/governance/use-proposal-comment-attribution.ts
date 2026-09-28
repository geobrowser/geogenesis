'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { normalizeSpaceId } from '~/core/access/space-access';
import { proposalCommentVotesQueryKey } from '~/core/io/query-keys';
import { fetchProposalVotes } from '~/core/io/subgraph/fetch-proposal';

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
 * The roles are passed in because the comments section already has them: it asks who among the
 * comment authors holds a role in order to offer the "editors only" filter, and both roles come back
 * from that one request — so asking again here would be the same request twice.
 */
export function useProposalCommentAttribution({
  entityId,
  spaceId,
  editorSpaceIds,
  memberSpaceIds,
  isLoadingRoles,
  isRolesError,
  enabled,
}: {
  entityId: string | null;
  /** The space the comments section is reading, which for a proposal entity is the proposal's own. */
  spaceId: string;
  editorSpaceIds: ReadonlySet<string>;
  memberSpaceIds: ReadonlySet<string>;
  /** Whether that role lookup is still in flight, or failed outright — see the hold below. */
  isLoadingRoles: boolean;
  isRolesError: boolean;
  enabled: boolean;
}): Map<string, ProposalCommentAttribution> {
  const { data: proposal } = useQuery({
    queryKey: proposalCommentVotesQueryKey(entityId ?? ''),
    enabled: enabled && Boolean(entityId),
    // The votes-only reader, not `fetchProposal`: that one also hydrates the creator's profile and
    // every voter's, which this query would discard — and it is invalidated repeatedly as a vote
    // settles through the indexer, so the waste would repeat with it.
    queryFn: ({ signal }) => fetchProposalVotes({ id: entityId!, signal }),
  });

  // No optimistic overlay of the reader's own vote here, deliberately. The store that holds it
  // (`optimistic-voted-atom`) is keyed by proposal alone, so it cannot say which account cast the
  // choice it carries or which of several is newest — and this badge makes a statement about a named
  // person, which is the one place those gaps are not survivable: switch accounts before the record
  // confirms and the previous account's vote gets painted onto the new one's comments.
  //
  // Both the Accept/Reject control and the vote row do overlay it, and are welcome to: they describe
  // the reader to themselves, where being a beat ahead is the point and mistaking whose vote it is has
  // no victim. Here the record is the only thing that speaks. `AcceptOrReject` invalidates this query
  // on a stagger starting 800ms after the vote lands, so the badge follows within a beat, and the
  // reader already has immediate confirmation in the control they just pressed.

  // Both role sets were gathered against the caller's space. For a proposal entity that is the
  // proposal's own space, which is the premise this feature rests on — but if the two ever disagree,
  // those ids answer a question about a different space. Say nothing rather than badge someone with a
  // role they may not hold here; the votes survive, because they are the proposal's own record.
  const rolesMatchProposalSpace = proposal ? normalizeSpaceId(proposal.spaceId) === normalizeSpaceId(spaceId) : false;

  return React.useMemo(() => {
    if (!proposal) return EMPTY_ATTRIBUTION;

    // Nothing is drawn until the roles have answered. They resolve independently of the votes, so
    // drawing early means a voter reads as a bare "Rejected" and then becomes "Editor · Rejected" a
    // beat later — the page correcting itself about a person, which is the failure this badge is
    // supposed to avoid. An absent badge is honest; a half-built one is not.
    //
    // A failed lookup is held the same way rather than treated as an answer. Empty role sets are how
    // "nobody here holds a role" looks, so publishing them on error would unbadge every editor on the
    // page and leave their votes reading as a bare "Rejected" — stating something false rather than
    // declining to state anything.
    if (isLoadingRoles || isRolesError) return EMPTY_ATTRIBUTION;

    return proposalCommentAttribution({
      votes: proposal.votes,
      editorSpaceIds: rolesMatchProposalSpace ? editorSpaceIds : [],
      memberSpaceIds: rolesMatchProposalSpace ? memberSpaceIds : [],
      // The reader reports whether it saw every vote. Where it did not, an editor's silence is not
      // established, so the badge says nothing about it instead of claiming they did not vote.
      votesComplete: proposal.complete,
    });
  }, [proposal, rolesMatchProposalSpace, editorSpaceIds, memberSpaceIds, isLoadingRoles, isRolesError]);
}
