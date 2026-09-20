'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { ID } from '~/core/id';
import { isPendingPersonalSpaceId } from '~/core/state/pending-personal-space';
import { NavUtils } from '~/core/utils/utils';

import { useOpenCreateSpaceDialog } from '../create-space/create-space-dialog';

/** Shared navigation for the desktop create dropdown and mobile profile menu. */
export function useCreateEntityActions(spaceId: string | null | undefined) {
  const router = useRouter();
  const openCreateSpaceDialog = useOpenCreateSpaceDialog();
  const creatableSpaceId = spaceId && !isPendingPersonalSpaceId(spaceId) ? spaceId : null;

  // Keep a zero-argument action so button click events are never mistaken for dialog presets.
  const createSpace = React.useCallback(() => openCreateSpaceDialog(), [openCreateSpaceDialog]);

  const createEntity = React.useCallback(() => {
    if (!creatableSpaceId) return;
    router.push(NavUtils.toEntity(creatableSpaceId, ID.createEntityId(), true));
  }, [creatableSpaceId, router]);

  const createProperty = React.useCallback(() => {
    if (!creatableSpaceId) return;
    router.push(`${NavUtils.toEntity(creatableSpaceId, ID.createEntityId(), true)}&type=property`);
  }, [creatableSpaceId, router]);

  return {
    canCreateInSpace: creatableSpaceId !== null,
    createEntity,
    createProperty,
    createSpace,
  };
}
