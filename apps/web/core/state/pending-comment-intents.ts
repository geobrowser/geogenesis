'use client';

import { atom } from 'jotai';

/**
 * Signed-out users can click Comment / Reply before they have typed anything.
 */
export type PendingCommentComposerIntent = {
  entityId: string;
  replyToCommentId: string | null;
};

export const pendingCommentComposerAtom = atom<PendingCommentComposerIntent | null>(null);
