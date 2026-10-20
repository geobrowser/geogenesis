'use client';

import { useCallback } from 'react';

import { atom, useSetAtom } from 'jotai';

import type { ActionContext } from '~/core/action-context';
import type { ResponseKind } from '~/core/responses/entity-response';

export type HeldVote = {
  actionId: string;
  entityId: string;
  spaceId: string;
  responseKind: ResponseKind | null;
  title: string;
  attribution: ActionContext;
};

/**
 * Kept app-wide, not in the control, so a press survives the control unmounting and is carried out
 * once even when two controls for the same entity were pressed. `HeldVotesRunner` carries it out
 * when sign-in resolves.
 */
export const heldVotesAtom = atom<HeldVote[]>([]);

export function useHoldVote() {
  const setHeld = useSetAtom(heldVotesAtom);
  return useCallback(
    (vote: HeldVote) => setHeld(prev => [...prev.filter(held => held.actionId !== vote.actionId), vote]),
    [setHeld]
  );
}
