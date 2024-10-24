'use client';

import { useHydrated } from './use-hydrated';
import { useSmartAccount } from './use-smart-account';
import { useSpace } from './use-space';

export function useAccessControl(spaceId: string) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();
  const smartAccount = useSmartAccount();
  const address = smartAccount?.account.address;

  const { space } = useSpace(spaceId);

  if (!address || !hydrated || !space) {
    return {
      isEditor: false,
      isMember: false,
    };
  }

  return {
    isMember: space.members.map(s => s.toLowerCase()).includes(address.toLowerCase()),
    isEditor: space.editors.map(s => s.toLowerCase()).includes(address.toLowerCase()),
  };
}
