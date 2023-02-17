import { observable } from '@legendapp/state';
import { useAccount } from 'wagmi';
import { useGeoProfile } from '../auth/use-geo-profile';

/* Extracting state outside component so any component can use this hook and share the same state */
const isOnboardingVisible = observable(false);

export function useOnboarding() {
  /* Note! Stub hook! Need to have profile backend ready... */
  const { profile } = useGeoProfile();

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
