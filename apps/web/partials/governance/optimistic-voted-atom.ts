'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

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

export function useIsOptimisticallyVoted(proposalId: string): boolean {
  const set = useAtomValue(optimisticVotedIdsAtom);
  return set.has(proposalId);
}
