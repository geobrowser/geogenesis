'use client';

import { useAccountEffect, usePrivy } from '@geogenesis/auth';
import { atom, useAtom } from 'jotai';
import { useSearchParams } from 'next/navigation';

import { useCallback, useEffect } from 'react';

import { Environment } from '../environment';
import { usePersonalSpaceId } from './use-personal-space-id';

const isOnboardingVisibleAtom = atom(false);

export function useOnboarding() {
  const params = useSearchParams();
  const onboardFlag = params?.get(Environment.variables.onboardFlag);

  const { user, isModalOpen } = usePrivy();

  const [isOnboardingVisible, setIsOnboardingVisible] = useAtom(isOnboardingVisibleAtom);
  const { isRegistered, isFetched, isLoading } = usePersonalSpaceId();

  const validOnboardCode = onboardFlag && onboardFlag === Environment.variables.onboardCode;
  const shouldOnboard = isFetched && !isLoading && !isRegistered && user && validOnboardCode;

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

      if (address && isFetched && !isRegistered) {
        setIsOnboardingVisible(true);
      }
    },
  });

  const hideOnboarding = useCallback(() => {
    setIsOnboardingVisible(false);
  }, [setIsOnboardingVisible]);

  return { isOnboardingVisible, hideOnboarding };
}
