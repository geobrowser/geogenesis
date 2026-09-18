'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { normalizeSpaceId } from '~/core/access/space-access';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { proposalCommentVotesQueryKey } from '~/core/io/query-keys';
import { fetchProposalVotes } from '~/core/io/subgraph/fetch-proposal';

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

  // The vote the reader just cast, before the chain and the indexer have caught up. `AcceptOrReject`
  // invalidates the query above on success, but that is a round trip away; this is the same
  // optimistic record the governance list uses to sink a card the moment it is voted on.
  const optimisticVote = useOptimisticVoteChoice(entityId ?? '');
  const { personalSpaceId } = usePersonalSpaceId();

  /** What the fetched record says about the reader, which is what the optimistic choice is racing. */
  const recordedOwnVote = React.useMemo(() => {
    if (!proposal || !personalSpaceId) return null;
    const own = proposal.votes.find(v => normalizeSpaceId(v.voterSpaceId) === normalizeSpaceId(personalSpaceId));
    return own?.vote ?? null;
  }, [proposal, personalSpaceId]);

  // That optimistic record is deliberately never cleared once the vote lands — the governance list
  // reads it to keep a voted card sunk, because the API's own sort gate is disabled (see
  // `accept-or-reject.tsx`) — so it cannot stay authoritative here. Left to win forever it would mask
  // every later change: vote in this tab, change the vote in another, and the refetched record would
  // be overwritten by this session's stale choice until a reload.
  //
  // So it is retired the first time the record agrees with it. Until then the reader sees their own
  // vote; after that the record speaks for itself, including when it has moved on. Changing the vote
  // is a new choice, so it arms again.
  //
  // Known gap, deliberately left: agreement is value equality, and a record can agree with a choice it
  // predates. Change a vote ACCEPT → REJECT → ACCEPT inside the indexer's lag and the third choice is
  // confirmed on the spot by the first record, so when the REJECT finally lands the badge shows it
  // until the last transaction indexes too. Distinguishing that needs a generation from the vote path —
  // the optimistic store is keyed by proposal and choice, with nothing to say which write is newer —
  // and every purely local rule tried here trades this narrow case for a wider one: confirming only on
  // a *transition* to the value instead leaves a vote changed in another tab masked indefinitely.
  // Self-corrects on the next index, and needs two changes of mind in a few seconds to reach.
  const optimisticKey = optimisticVote ? `${normalizeSpaceId(entityId ?? '')}:${optimisticVote}` : null;
  const [confirmedKey, setConfirmedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (optimisticKey && recordedOwnVote === optimisticVote) {
      setConfirmedKey(optimisticKey);
    }
  }, [optimisticKey, optimisticVote, recordedOwnVote]);

  const ownVoteToShow = optimisticKey && confirmedKey !== optimisticKey ? optimisticVote : null;

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

    const votes =
      ownVoteToShow && personalSpaceId
        ? [
            ...proposal.votes.filter(v => normalizeSpaceId(v.voterSpaceId) !== normalizeSpaceId(personalSpaceId)),
            { voterSpaceId: personalSpaceId, vote: ownVoteToShow },
          ]
        : proposal.votes;

    return proposalCommentAttribution({
      votes,
      editorSpaceIds: rolesMatchProposalSpace ? editorSpaceIds : [],
      memberSpaceIds: rolesMatchProposalSpace ? memberSpaceIds : [],
      // The reader reports whether it saw every vote. Where it did not, an editor's silence is not
      // established, so the badge says nothing about it instead of claiming they did not vote.
      votesComplete: proposal.complete,
    });
  }, [
    proposal,
    rolesMatchProposalSpace,
    editorSpaceIds,
    memberSpaceIds,
    isLoadingRoles,
    isRolesError,
    ownVoteToShow,
    personalSpaceId,
  ]);
}
