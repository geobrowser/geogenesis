'use client';

import { useHydrated } from './use-hydrated';
import { usePersonalSpaceId } from './use-personal-space-id';
import { useSpace } from './use-space';

export function useAccessControl(spaceId: string) {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();

  // In GRC-20 v2, editors/members are identified by their personal space ID (UUID),
  // not their wallet address. Look up the user's personal space ID from SpaceRegistry.
  const { personalSpaceId, isLoading: isLoadingSpaceId } = usePersonalSpaceId();

  const { space } = useSpace(spaceId);

  if (!personalSpaceId || !hydrated || !space || isLoadingSpaceId) {
    return {
      isEditor: false,
      isMember: false,
    };
  }

  // For personal spaces, the owner is the editor
  if (space.type === 'PERSONAL') {
    const isOwner = personalSpaceId === spaceId;
    return {
      isEditor: isOwner,
      isMember: isOwner,
    };
  }

  return {
    isMember: space.members.map(s => s.toLowerCase()).includes(personalSpaceId.toLowerCase()),
    isEditor: space.editors.map(s => s.toLowerCase()).includes(personalSpaceId.toLowerCase()),
  };
}
