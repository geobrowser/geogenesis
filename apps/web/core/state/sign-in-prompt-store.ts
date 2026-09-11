'use client';

import { useCallback } from 'react';

import { atom, useAtom, useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

export type SignInPromptAction = 'vote' | 'join' | 'comment';

export const signInPromptActionAtom = atom<SignInPromptAction | null>(null);

export function useSignInPrompt() {
  const [action, setAction] = useAtom(signInPromptActionAtom);
  const setRedirect = useSetAtom(postOnboardingRedirectAtom);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Opening the prompt means the user entered account creation through an action
  const open = useCallback(
    (next: SignInPromptAction) => {
      const search = searchParams?.toString();
      setRedirect(`${pathname}${search ? `?${search}` : ''}`);
      setAction(next);
    },
    [pathname, searchParams, setAction, setRedirect]
  );

  const close = useCallback(() => setAction(null), [setAction]);

  return { action, open, close };
}
