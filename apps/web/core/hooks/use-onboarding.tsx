import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

import * as React from 'react';

import { useAccount } from 'wagmi';

import { useGeoProfile } from './use-geo-profile';

const isOnboardingVisible$ = observable(false);

export function useOnboarding() {
  const { address } = useAccount();
  const isOnboardingVisible = useSelector(isOnboardingVisible$);
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
      isOnboardingVisible$.set(true);
    }
  }, [isFetched, profile, address]);

  useAccount({
    onDisconnect: () => isOnboardingVisible$.set(false),
    onConnect({ address }) {
      if (address && isFetched && !profile) {
        isOnboardingVisible$.set(true);
      }
    },
  });

  const hideOnboarding = React.useCallback(() => {
    isOnboardingVisible$.set(false);
  }, []);

  return { isOnboardingVisible, hideOnboarding };
}
