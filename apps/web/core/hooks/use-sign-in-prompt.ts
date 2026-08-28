'use client';

import { useGeoLogin } from '@geogenesis/auth';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { trackPrivyAuth } from '~/core/analytics';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Opens Privy sign-in from a control a signed-out visitor pressed.
 *
 * Two things have to happen alongside `login()`, and both are easy to miss when a new surface
 * grows its own sign-in call: the current page is recorded so onboarding returns the visitor here
 * rather than dropping them on Explore, and the onboarding form is reset so a previous, abandoned
 * run doesn't reopen half-filled.
 *
 * Shared rather than copied so a control that prompts sign-in behaves the same wherever it lives —
 * the response pills on a claim page do exactly what the vote arrows on an entity page do.
 */
export function useSignInPrompt() {
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
  });

  return React.useCallback(() => {
    const search = searchParams?.toString();
    setPostOnboardingRedirect(`${pathname}${search ? `?${search}` : ''}`);
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    login();
  }, [login, pathname, searchParams, setAvatar, setName, setPostOnboardingRedirect, setSpaceId, setStep, setTopicId]);
}
