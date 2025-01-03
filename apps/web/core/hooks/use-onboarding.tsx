import { usePrivy } from '@privy-io/react-auth';
import { atom, useAtom } from 'jotai';
import { useParams, useSearchParams } from 'next/navigation';

import { useCallback, useEffect } from 'react';

import { useAccountEffect } from 'wagmi';

import { Environment } from '../environment';
import { useGeoProfile } from './use-geo-profile';
import { useSmartAccount } from './use-smart-account';

const isOnboardingVisibleAtom = atom(false);

export function useOnboarding() {
  const smartAccount = useSmartAccount();
  const address = smartAccount?.account.address;
  const params = useSearchParams();
  const onboardFlag = params?.get(Environment.variables.onboardFlag);

  const { user, isModalOpen } = usePrivy();

  const [isOnboardingVisible, setIsOnboardingVisible] = useAtom(isOnboardingVisibleAtom);
  const { profile, isFetched, isLoading } = useGeoProfile(address);

  const validOnboardCode = onboardFlag && onboardFlag === Environment.variables.onboardCode;
  const shouldOnboard = isFetched && !isLoading && !profile?.profileLink && user && validOnboardCode;

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

      if (address && isFetched && !profile) {
        setIsOnboardingVisible(true);
      }
    },
  });

  const hideOnboarding = useCallback(() => {
    setIsOnboardingVisible(false);
  }, [setIsOnboardingVisible]);

  return { isOnboardingVisible, hideOnboarding };
}
