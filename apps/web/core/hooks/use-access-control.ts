'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getSpaceAccess, noSpaceAccess, type SpaceAccess } from '~/core/access/space-access';

import { useHydrated } from './use-hydrated';
import { usePersonalSpaceId } from './use-personal-space-id';
import { useSpace } from './use-space';

type SpaceAccessState = SpaceAccess & {
  isLoading: boolean;
};

export function useAccessControl(spaceId: string): SpaceAccessState {
  // We need to wait for the client to check the status of the client-side wallet
  // before setting state. Otherwise there will be client-server hydration mismatches.
  const hydrated = useHydrated();

  // In GRC-20 v2, editors/members are identified by their personal space ID (UUID),
  // not their wallet address. Look up the user's personal space ID from SpaceRegistry.
  const { personalSpaceId, isLoading: isLoadingSpaceId } = usePersonalSpaceId();

  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const normalizedPersonalSpaceId = personalSpaceId?.toLowerCase();
  const shouldCheckDaoAccess = Boolean(hydrated && spaceId && normalizedPersonalSpaceId && space?.type !== 'PERSONAL');

  const { data: daoAccess = noSpaceAccess, isLoading: isLoadingDaoAccess } = useQuery({
    queryKey: ['space-access-control', spaceId, normalizedPersonalSpaceId],
    queryFn: ({ signal }) => Effect.runPromise(getSpaceAccess(space!, normalizedPersonalSpaceId!, signal)),
    enabled: shouldCheckDaoAccess,
  });

  if (!personalSpaceId || !hydrated || !space || isLoadingSpaceId) {
    return {
      isEditor: false,
      isMember: false,
      canEdit: false,
      isLoading: !hydrated || isLoadingSpaceId || isLoadingSpace,
    };
  }

  // For personal spaces, the owner is the editor
  if (space.type === 'PERSONAL') {
    const isOwner = personalSpaceId === spaceId;
    return {
      isEditor: isOwner,
      isMember: isOwner,
      canEdit: isOwner,
      isLoading: false,
    };
  }

  return {
    ...daoAccess,
    isLoading: isLoadingDaoAccess,
  };
}
