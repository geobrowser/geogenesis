import { atom } from 'jotai';

export type LockedOutJoin = {
  /** The add-back link to send an editor. */
  link: string;
  /** Named in the dialog, which can open after the viewer has moved on from the space (a queued join). */
  spaceName?: string;
};

/**
 * A Join the contract would refuse, or null. Set by `useJoinSpace` (live presses) and
 * `useRequestToBeMember` (queued joins), and shown by the app-level `AskEditorDialog`, so it outlives
 * the Join control that set it (some live in popovers that close when focus moves to the dialog).
 */
export const lockedOutJoinAtom = atom<LockedOutJoin | null>(null);
