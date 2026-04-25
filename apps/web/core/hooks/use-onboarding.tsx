'use client';

import { useAccountEffect, usePrivy } from '@geogenesis/auth';

import { useCallback, useEffect } from 'react';

import { atom, useAtom } from 'jotai';
import { useSearchParams } from 'next/navigation';

import { usePersonalSpaceId } from './use-personal-space-id';

const isOnboardingVisibleAtom = atom(false);

// URL param set when opening an entity preview from the onboarding
// "is this you?" step. Suppresses the onboarding dialog so the user can
// actually view the entity they clicked.
export const SUPPRESS_ONBOARDING_PARAM = 'fromOnboarding';

export function useOnboarding() {
  const { user, isModalOpen } = usePrivy();
  const searchParams = useSearchParams();
  // Double-check via window.location.search as a fallback in case the
  // router hook hasn't hydrated the value yet on first render.
  const windowSuppress =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(SUPPRESS_ONBOARDING_PARAM) === '1';
  const suppress = searchParams?.get(SUPPRESS_ONBOARDING_PARAM) === '1' || windowSuppress;

  const [isOnboardingVisible, setIsOnboardingVisible] = useAtom(isOnboardingVisibleAtom);
  const { isRegistered, isFetched, isLoading } = usePersonalSpaceId();

  const shouldOnboard = isFetched && !isLoading && !isRegistered && user && !suppress;

  // Set the onboarding to visible the first time we fetch the
  // profile for the user. Any subsequent changes to the visibility
  // state through `hideOnboarding` won't trigger this effect and the
  // onboarding will close.
  //
  // Whenever the user reloads Geo they will be prompted to go through
  // onboarding again if they don't have a profile.
  useEffect(() => {
    if (isModalOpen) {
      setIsOnboardingVisible(false);
    } else if (shouldOnboard) {
      setIsOnboardingVisible(true);
    } else {
      setIsOnboardingVisible(false);
    }
  }, [isModalOpen, setIsOnboardingVisible, shouldOnboard]);

  useAccountEffect({
    onDisconnect: () => setIsOnboardingVisible(false),
    onConnect(data) {
      const { address } = data;

      if (address && isFetched && !isRegistered && !suppress) {
        setIsOnboardingVisible(true);
      }
    },
  });

  const hideOnboarding = useCallback(() => {
    setIsOnboardingVisible(false);
  }, [setIsOnboardingVisible]);

  return { isOnboardingVisible, hideOnboarding };
}
