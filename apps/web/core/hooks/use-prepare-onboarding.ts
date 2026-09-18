'use client';

import * as React from 'react';

import { useSetAtom } from 'jotai';
import { usePathname, useSearchParams } from 'next/navigation';

import {
  avatarAtom,
  nameAtom,
  selectedTopicIdsAtom,
  spaceIdAtom,
  stepAtom,
  topicIdAtom,
} from '~/partials/onboarding/dialog';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Clears any half-finished onboarding and records where to return to, before a sign-in starts.
 *
 * `stepAtom` and the field atoms are persisted, so an abandoned run is still sitting there when the
 * next person signs in on the same browser — they would resume someone else's half-filled profile.
 *
 * `selectedTopicIdsAtom` is in that list and was the one everybody forgot. It is persisted like the
 * rest, but until now only sign-*out* cleared it — every sign-in path, including the hand-written
 * resets this hook replaced, left it alone. `PendingPersonalSpaceRunner` reads it and turns it into
 * membership proposals for the new personal space, so a browser where somebody abandoned onboarding
 * after picking interests would hand those picks to the next account and submit them on its behalf.
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
  const setSelectedTopicIds = useSetAtom(selectedTopicIdsAtom);

  /**
   * Where to land once onboarding finishes, which the four callers want three different things
   * from. Omitted sends them back to the page they pressed on, which is right for a control in the
   * page. `returnTo: null` clears it — the navbar's button is a sign-in from anywhere, not a return
   * to anywhere. `keepReturnTo` leaves the stored value alone entirely, for callers that track
   * their own destination and would be fighting this one: `use-ranking-compose-access.ts` holds
   * its redirect in a ref, and `sign-in-prompt.tsx` never set this at all.
   *
   * Spelled as two fields rather than a magic string because the alternative was a sentinel that
   * could collide with a real path.
   */
  return React.useCallback(
    ({ returnTo, keepReturnTo }: { returnTo?: string | null; keepReturnTo?: boolean } = {}) => {
      if (!keepReturnTo) {
        const search = searchParams?.toString();
        setPostOnboardingRedirect(returnTo === null ? null : (returnTo ?? `${pathname}${search ? `?${search}` : ''}`));
      }

      setName('');
      setTopicId('');
      setAvatar('');
      setSpaceId('');
      setStep('start');
      setSelectedTopicIds([]);
    },
    [
      pathname,
      searchParams,
      setAvatar,
      setName,
      setPostOnboardingRedirect,
      setSelectedTopicIds,
      setSpaceId,
      setStep,
      setTopicId,
    ]
  );
}
