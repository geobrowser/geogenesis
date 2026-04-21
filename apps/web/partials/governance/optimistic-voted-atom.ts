'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

/** Proposal ids whose card should already appear as "voted" (sunk to bottom of list). Written on click. */
const optimisticVotedIdsAtom = atom<Set<string>>(new Set<string>());

/** Proposal ids whose vote mutation resolved successfully. Written when useVote reports success. */
const confirmedVotedIdsAtom = atom<Set<string>>(new Set<string>());

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

export function useConfirmVote() {
  const setter = useSetAtom(confirmedVotedIdsAtom);
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

export function useConfirmedVotedIds(): Set<string> {
  return useAtomValue(confirmedVotedIdsAtom);
}
