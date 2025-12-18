'use client';

import * as React from 'react';

import { useSmartAccount } from './use-smart-account';
import { useSpacesWhereMember } from './use-spaces-where-member';

/**
 * Returns a Set of space IDs where the current user has edit permissions
 * (is either an editor or member of the space).
 */
export function useEditableSpaces() {
  const { smartAccount } = useSmartAccount();
  const address = smartAccount?.account.address;
  const spaces = useSpacesWhereMember(address);

  const editableSpaceIds = React.useMemo(() => {
    if (!address || !spaces.length) {
      return new Set<string>();
    }

    const addressLower = address.toLowerCase();

    // Filter to spaces where user is editor or member
    const editable = spaces.filter(space => {
      const isEditor = space.editors.map(s => s.toLowerCase()).includes(addressLower);
      const isMember = space.members.map(s => s.toLowerCase()).includes(addressLower);
      return isEditor || isMember;
    });

    return new Set(editable.map(s => s.id));
  }, [address, spaces]);

  return {
    editableSpaceIds,
    isLoading: !address,
  };
}

/**
 * Given a list of entity space IDs, returns which entities are editable
 * based on the current user's permissions.
 */
export function useEditableEntities(
  entities: Array<{ entityId: string; spaceId: string | null | undefined }>
) {
  const { editableSpaceIds, isLoading } = useEditableSpaces();

  const editableEntityIds = React.useMemo(() => {
    if (isLoading) {
      return new Set<string>();
    }

    return new Set(
      entities
        .filter(entity => entity.spaceId && editableSpaceIds.has(entity.spaceId))
        .map(entity => entity.entityId)
    );
  }, [entities, editableSpaceIds, isLoading]);

  return {
    editableEntityIds,
    editableSpaceIds,
    isLoading,
  };
}
