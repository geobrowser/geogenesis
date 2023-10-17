import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

import { useAccount } from 'wagmi';

/* Extracting state outside component so any component can use this hook and share the same state */
const isOnboardingVisible$ = observable(true);

export function useOnboarding() {
  const isOnboardingVisible = useSelector(isOnboardingVisible$);

  useAccount({
    onDisconnect: () => isOnboardingVisible$.set(false),
    onConnect({ address, isReconnected }) {
      // If the user autoconnects, we don't want to show the modal.
      if (address && !isReconnected) {
        isOnboardingVisible$.set(true);
      }
    },
  });

  const hideOnboarding = () => {
    isOnboardingVisible$.set(false);
  };

  return { isOnboardingVisible, hideOnboarding };
}
