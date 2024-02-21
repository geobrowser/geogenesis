import { atom, useAtom } from 'jotai';

import * as React from 'react';

import { useAccount, useAccountEffect } from 'wagmi';

import { useGeoProfile } from './use-geo-profile';

const isOnboardingVisibleAtom = atom(false);

export function useOnboarding() {
  const { address } = useAccount();
  const [isOnboardingVisible, setIsOnboardingVisible] = useAtom(isOnboardingVisibleAtom);
  const { profile, isFetched } = useGeoProfile(address);

  // Set the onboarding to visible the first time we fetch the
  // profile for the user. Any subsequent changes to the visibility
  // state through `hideOnboarding` won't trigger this effect and the
  // onboarding will close.
  //
  // Whenever the user reloads Geo they will be prompted to go through
  // onboarding again if they don't have a profile.
  React.useEffect(() => {
    if (address && isFetched && !profile) {
      setIsOnboardingVisible(true);
    }
  }, [isFetched, profile, address, setIsOnboardingVisible]);

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

  return { isOnboardingVisible, hideOnboarding };
}
