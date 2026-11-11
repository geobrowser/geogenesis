import { atom } from 'jotai';

/**
 * The add-back link for a Join press the contract would refuse, or null. Set by `useJoinSpace`
 * and shown by the app-level `AskEditorDialog`, so it outlives the Join control that set it
 * (some live in popovers that close when focus moves to the dialog).
 */
export const lockedOutJoinLinkAtom = atom<string | null>(null);
