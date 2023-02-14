import { useObservable } from '@legendapp/state/react';
import { useAccount } from 'wagmi';
import { useGeoProfile } from '../auth/use-geo-profile';

export function useOnboarding() {
  const { profile } = useGeoProfile();
  const isOnboardingVisible = useObservable(false);

  useAccount({
    onDisconnect: () => isOnboardingVisible.set(false),
    onConnect({ address, isReconnected }) {
      // If the user autoconnects, we don't want to show the modal.
      if (address && !isReconnected) {
        isOnboardingVisible.set(true);
      }
    },
  });

  const hideOnboarding = () => isOnboardingVisible.set(false);

  return { isOnboardingVisible, hideOnboarding };
}
