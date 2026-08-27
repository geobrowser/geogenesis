'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

type OptimisticVoteChoice = 'ACCEPT' | 'REJECT' | 'ABSTAIN';

/** Proposal ids whose card should appear as "voted" (sunk to the bottom of the list) as soon as
 *  the user clicks Accept/Reject, without waiting for the tx round-trip or a server refetch.
 *  Removed by useRemoveOptimisticVote if the vote mutation errors. */
const optimisticVotedIdsAtom = atom<Map<string, OptimisticVoteChoice | true>>(new Map());

export function useAddOptimisticVote() {
  const setter = useSetAtom(optimisticVotedIdsAtom);
  return (proposalId: string, choice: OptimisticVoteChoice | true = true) => {
    setter(prev => {
      if (prev.get(proposalId) === choice) return prev;
      const next = new Map(prev);
      next.set(proposalId, choice);
      return next;
    });
  };
}

export function useRemoveOptimisticVote() {
  const setter = useSetAtom(optimisticVotedIdsAtom);
  return (proposalId: string) => {
    setter(prev => {
      if (!prev.has(proposalId)) return prev;
      const next = new Map(prev);
      next.delete(proposalId);
      return next;
    });
  };
}

export function useIsOptimisticallyVoted(proposalId: string): boolean {
  const votes = useAtomValue(optimisticVotedIdsAtom);
  return votes.has(proposalId);
}

export function useOptimisticVoteChoice(proposalId: string): OptimisticVoteChoice | undefined {
  const votes = useAtomValue(optimisticVotedIdsAtom);
  const vote = votes.get(proposalId);
  return vote === true ? undefined : vote;
}
