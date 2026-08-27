'use client';

import { useGeoLogin } from '@geogenesis/auth';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { trackPrivyAuth } from '~/core/analytics';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Opens Privy sign-in directly from an action a signed-out reader took (the
 * upvote/downvote behaviour): no intermediate "create your account" dialog.
 * Onboarding state is reset and the post-onboarding redirect points back at
 * the current page, so the reader lands where they clicked.
 */
export function usePrivySignIn(options: { onComplete?: () => void } = {}) {
  const { onComplete } = options;
  const { login } = useGeoLogin({
    onComplete: args => {
      trackPrivyAuth(args, { auth_flow: 'manual_login' });
      onComplete?.();
    },
  });
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
