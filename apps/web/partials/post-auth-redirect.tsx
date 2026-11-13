'use client';

import * as React from 'react';

import { useAtom, useAtomValue } from 'jotai';
import { useRouter } from 'next/navigation';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useAccountAddress } from '~/core/wallet/account-readiness';

import { stepAtom } from '~/partials/onboarding/onboarding-atoms';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

/**
 * Resumes a recorded flow (e.g. "Add my ranking") after the user signs in with
 * an existing account. New accounts go through the onboarding dialog instead,
 * which performs its own redirect once the personal space is created.
 */
export function PostAuthRedirect() {
  const router = useRouter();
  const [redirect, setRedirect] = useAtom(postOnboardingRedirectAtom);
  const accountAddress = useAccountAddress();
  const { personalSpaceId, isRegistered, isFetched } = usePersonalSpaceId();
  const onboardingStep = useAtomValue(stepAtom);

  React.useEffect(() => {
    if (!redirect) return;
    if (!accountAddress || !isFetched) return;
    // No personal space yet — the onboarding dialog owns the redirect.
    if (!isRegistered || !personalSpaceId) return;
    // Onboarding mid-flight (incl. 'completed') — the dialog pushes and clears.
    if (onboardingStep !== 'start' && onboardingStep !== 'done') return;

    setRedirect(null);
    router.push(redirect);
  }, [redirect, accountAddress, isFetched, isRegistered, personalSpaceId, onboardingStep, router, setRedirect]);

  return null;
}
