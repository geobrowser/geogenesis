'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';

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

  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const normalizedPersonalSpaceId = personalSpaceId?.toLowerCase();
  const shouldCheckDaoAccess = Boolean(hydrated && spaceId && normalizedPersonalSpaceId && space?.type !== 'PERSONAL');

  const { data: isMemberOfDao = false, isLoading: isLoadingMember } = useQuery({
    queryKey: ['space-access-control', 'member', spaceId, normalizedPersonalSpaceId],
    queryFn: () => Effect.runPromise(getIsMemberOfSpace(spaceId, normalizedPersonalSpaceId!)),
    enabled: shouldCheckDaoAccess,
  });

  const { data: isEditorOfDao = false, isLoading: isLoadingEditor } = useQuery({
    queryKey: ['space-access-control', 'editor', spaceId, normalizedPersonalSpaceId],
    queryFn: () => Effect.runPromise(getIsEditorOfSpace(spaceId, normalizedPersonalSpaceId!)),
    enabled: shouldCheckDaoAccess,
  });

  if (!personalSpaceId || !hydrated || !space || isLoadingSpaceId) {
    return {
      isEditor: false,
      isMember: false,
      isLoading: !hydrated || isLoadingSpaceId || isLoadingSpace,
    };
  }

  // For personal spaces, the owner is the editor
  if (space.type === 'PERSONAL') {
    const isOwner = personalSpaceId === spaceId;
    return {
      isEditor: isOwner,
      isMember: isOwner,
      isLoading: false,
    };
  }

  return {
    isMember: isMemberOfDao,
    isEditor: isEditorOfDao,
    isLoading: isLoadingMember || isLoadingEditor,
  };
}
