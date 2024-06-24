import { usePrivy } from '@privy-io/react-auth';
import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { useAccountEffect } from 'wagmi';

import { useGeoProfile } from './use-geo-profile';
import { useSmartAccount } from './use-smart-account';

const isOnboardingVisibleAtom = atom(false);

export function useOnboarding() {
  const smartAccount = useSmartAccount();
  const address = smartAccount?.account.address;

  const { isModalOpen } = usePrivy();
  const [, setIsOnboardingVisible] = useAtom(isOnboardingVisibleAtom);
  const { profile, isFetched, isLoading } = useGeoProfile(address);

  // Set the onboarding to visible the first time we fetch the
  // profile for the user. Any subsequent changes to the visibility
  // state through `hideOnboarding` won't trigger this effect and the
  // onboarding will close.
  //
  // Whenever the user reloads Geo they will be prompted to go through
  // onboarding again if they don't have a profile.
  React.useEffect(() => {
    if (isModalOpen) {
      setIsOnboardingVisible(false);
    } else if (isFetched && !isLoading && !profile) {
      setIsOnboardingVisible(true);
    } else {
      setIsOnboardingVisible(false);
    }
  }, [isFetched, profile, isLoading, isModalOpen, setIsOnboardingVisible]);

  useAccountEffect({
    onDisconnect: () => setIsOnboardingVisible(false),
    onConnect({ address }) {
      if (address && isFetched && !profile) {
        setIsOnboardingVisible(true);
      }
    },
  });

  const hideOnboarding = React.useCallback(() => {
    setIsOnboardingVisible(false);
  }, [setIsOnboardingVisible]);

  // Disabling onboarding until full launch as we are currently doing migrations
  // and some other work affecting user onboarding.
  return { isOnboardingVisible: false, hideOnboarding };
}
