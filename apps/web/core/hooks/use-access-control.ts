'use client';

import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';

import { normalizeSpaceId, type SpaceAccess } from '~/core/access/space-access';
import { getIsEditorOfSpace, getIsMemberOfSpace } from '~/core/io/queries';

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
  const normalizedSpaceId = normalizeSpaceId(spaceId);
  const normalizedPersonalSpaceId = personalSpaceId ? normalizeSpaceId(personalSpaceId) : undefined;
  const shouldCheckDaoAccess = Boolean(hydrated && spaceId && normalizedPersonalSpaceId && space?.type !== 'PERSONAL');

  const { data: isMemberOfDao = false, isLoading: isLoadingMember } = useQuery({
    queryKey: ['space-access-control', 'member', normalizedSpaceId, normalizedPersonalSpaceId],
    queryFn: ({ signal }) => Effect.runPromise(getIsMemberOfSpace(normalizedSpaceId, normalizedPersonalSpaceId!, signal)),
    enabled: shouldCheckDaoAccess,
  });

  const { data: isEditorOfDao = false, isLoading: isLoadingEditor } = useQuery({
    queryKey: ['space-access-control', 'editor', normalizedSpaceId, normalizedPersonalSpaceId],
    queryFn: ({ signal }) => Effect.runPromise(getIsEditorOfSpace(normalizedSpaceId, normalizedPersonalSpaceId!, signal)),
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
    const isOwner = normalizedPersonalSpaceId === normalizedSpaceId;
    return {
      isEditor: isOwner,
      isMember: isOwner,
      canEdit: isOwner,
      isLoading: false,
    };
  }

  const canEdit = isMemberOfDao || isEditorOfDao;

  return {
    isMember: isMemberOfDao,
    isEditor: isEditorOfDao,
    canEdit,
    isLoading: !canEdit && (isLoadingMember || isLoadingEditor),
  };
}
