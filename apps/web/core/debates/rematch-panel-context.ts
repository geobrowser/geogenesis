'use client';

import * as React from 'react';

import { atom, useAtomValue, useSetAtom } from 'jotai';
import { usePathname } from 'next/navigation';

import type { DebateRematchSession } from './api';
import type { useCreateDebateRematchRequest } from './hooks';

export type RematchPanelContext = {
  sessionId: string;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  opponentPresent: boolean;
  canPublishDebateIn: (spaceId: string) => boolean;
  createRequest: Pick<ReturnType<typeof useCreateDebateRematchRequest>, 'mutate' | 'isPending' | 'error' | 'variables'>;
};

const rematchPanelAtom = atom<(RematchPanelContext & { pathname: string | null }) | null>(null);

/** The app-level entity panel is a sibling of the picker, outside its room provider. */
export function useRegisterRematchPanelContext(context: RematchPanelContext) {
  const pathname = usePathname();
  const setContext = useSetAtom(rematchPanelAtom);
  const { sessionId, session, currentUserId, opponentPresent, canPublishDebateIn, createRequest } = context;
  const { mutate, isPending, error, variables } = createRequest;
  React.useEffect(() => {
    const value = {
      pathname,
      sessionId,
      session,
      currentUserId,
      opponentPresent,
      canPublishDebateIn,
      createRequest: { mutate, isPending, error, variables },
    };
    setContext(value);
    return () => setContext(current => (current === value ? null : current));
  }, [
    pathname,
    sessionId,
    session,
    currentUserId,
    opponentPresent,
    canPublishDebateIn,
    mutate,
    isPending,
    error,
    variables,
    setContext,
  ]);
}

export function useRematchPanelContext() {
  const pathname = usePathname();
  const context = useAtomValue(rematchPanelAtom);
  // Stop offering the old session immediately on navigation, before the picker's cleanup runs.
  return context?.pathname === pathname ? context : null;
}
