'use client';

import { useGeoLogin } from '@geogenesis/auth';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { trackPrivyAuth } from '~/core/analytics';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Opens Privy's own "Log in or sign up" dialog straight away, the way the upvote control does.
 *
 * The alternative, `SignInPrompt`, shows a "create your personal space" card first — which costs
 * the viewer a second click and paints a tinted overlay over the page on the way. For a control
 * whose only barrier is "you are signed out", going directly to the login is the shorter path.
 *
 * Clears any half-finished onboarding first, and records where to return to so the viewer lands
 * back on the page they left rather than being bounced to explore.
 */
export function usePrivySignIn(onComplete?: () => void) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  // Held in a ref so callers can pass an inline closure without re-creating the returned callback
  // on every render — `castVote` and the feed's button handler both depend on its identity.
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  const { login } = useGeoLogin({
    onComplete: args => {
      trackPrivyAuth(args, { auth_flow: 'manual_login' });
      onCompleteRef.current?.();
    },
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
