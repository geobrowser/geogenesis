'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

export type ThankingDebate = {
  debateId: string;
  hasUploadedRecording: boolean;
  recordingCancelled: boolean;
};

// The debate whose post-debate thank-you screen the user is currently on. The room page also
// carries the authoritative server recording state so the global banner survives a remount after
// IndexedDB's completed upload row has been removed.
const thankingDebateAtom = atom<ThankingDebate | null>(null);

export const useThankingDebate = () => useAtomValue(thankingDebateAtom);

export const useSetThankingDebate = () => useSetAtom(thankingDebateAtom);
