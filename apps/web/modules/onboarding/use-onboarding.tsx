import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useGeoProfile } from '../auth/use-geo-profile';

export function useOnboarding() {
  const { profile } = useGeoProfile();
  const [connected, setConnected] = useState(false);

  useAccount({
    onDisconnect: () => setConnected(false),
    onConnect({ address, isReconnected }) {
      // If the user autoconnects, we don't want to show the modal.
      if (address && !isReconnected) {
        setConnected(true);
      }
    },
  });

  const showOnboarding = !profile && connected;

  return { showOnboarding };
}
