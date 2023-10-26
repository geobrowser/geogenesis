import { observable } from '@legendapp/state';
import { useSelector } from '@legendapp/state/react';

import * as React from 'react';

import { useAccount } from 'wagmi';

/* Extracting state outside component so any component can use this hook and share the same state */
const isOnboardingVisible$ = observable(true);
const hasOnboarded$ = observable(false);

export function useOnboarding() {
  const isOnboardingVisible = useSelector(isOnboardingVisible$);
  const hasOnboarded = useSelector(hasOnboarded$);

  useAccount({
    onDisconnect: () => isOnboardingVisible$.set(false),
    onConnect({ address }) {
      if (address) {
        isOnboardingVisible$.set(true);
      }
    },
  });

  const hideOnboarding = React.useCallback(() => {
    isOnboardingVisible$.set(false);
  }, []);

  const setHasOnboarded = React.useCallback(() => {
    hasOnboarded$.set(true);
  }, []);

  return { isOnboardingVisible, hasOnboarded, setHasOnboarded, hideOnboarding };
}
