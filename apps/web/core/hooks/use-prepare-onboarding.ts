'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Clears any half-finished onboarding and records where to return to, before a sign-in starts.
 *
 * `stepAtom` and the field atoms are persisted, so an abandoned run is still sitting there when the
 * next person signs in on the same browser — they would resume someone else's half-filled profile.
 * The redirect is taken at the press rather than on completion, because completion can arrive
 * minutes later on a different URL.
 *
 * Extracted from `usePrivySignIn` when a second way into onboarding appeared (GEO-2948). Any path
 * that signs someone in has to do this, and the headless email flow skipping it is not a difference
 * anyone would notice until they resumed a stranger's onboarding.
 */
export function usePrepareOnboarding() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  /**
   * `redirectTo` omitted sends them back to the page they pressed on, which is right for a control
   * in the page. Pass an explicit destination to override it, or `null` for the entry points that
   * deliberately clear it — the navbar's button is a sign-in from anywhere, not a return to
   * anywhere, and leaving a stale path there would send the next person somewhere they never were.
   */
  return React.useCallback(
    (redirectTo?: string | null) => {
      const search = searchParams?.toString();
      setPostOnboardingRedirect(
        redirectTo === null ? null : (redirectTo ?? `${pathname}${search ? `?${search}` : ''}`)
      );
      setName('');
      setTopicId('');
      setAvatar('');
      setSpaceId('');
      setStep('start');
    },
    [pathname, searchParams, setAvatar, setName, setPostOnboardingRedirect, setSpaceId, setStep, setTopicId]
  );
}
