'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

/** Proposal ids whose card should appear as "voted" (sunk to the bottom of the list) as soon as
 *  the user clicks Accept/Reject, without waiting for the tx round-trip or a server refetch.
 *  Removed by useRemoveOptimisticVote if the vote mutation errors. */
const optimisticVotedIdsAtom = atom<Set<string>>(new Set<string>());

export function useAddOptimisticVote() {
  const setter = useSetAtom(optimisticVotedIdsAtom);
  return (proposalId: string) => {
    setter(prev => {
      if (prev.has(proposalId)) return prev;
      const next = new Set(prev);
      next.add(proposalId);
      return next;
    });
  };
}

export function useRemoveOptimisticVote() {
  const setter = useSetAtom(optimisticVotedIdsAtom);
  return (proposalId: string) => {
    setter(prev => {
      if (!prev.has(proposalId)) return prev;
      const next = new Set(prev);
      next.delete(proposalId);
      return next;
    });
  };
}

export function useIsOptimisticallyVoted(proposalId: string): boolean {
  const set = useAtomValue(optimisticVotedIdsAtom);
  return set.has(proposalId);
}
