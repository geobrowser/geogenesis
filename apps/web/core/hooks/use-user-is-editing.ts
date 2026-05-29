'use client';

import * as React from 'react';

import { EntitySidePanelEditContext } from '~/core/state/entity-side-panel-edit-context';

import { useEditable } from '../state/editable-store';
import { useAccessControl } from './use-access-control';
import { useHydrated } from './use-hydrated';

export function useUserIsEditing(spaceId: string) {
  const panelCtx = React.useContext(EntitySidePanelEditContext);

  const { editable } = useEditable();
  const hydrated = useHydrated();
  const { canEdit, isLoading } = useAccessControl(spaceId);

  const editableIntent = panelCtx?.spaceId === spaceId ? panelCtx.panelWantsEdit : editable;

  // Before hydration, access control returns false to avoid SSR mismatches.
  // If the editable atom is already true (user was editing before navigation),
  // trust it until access control has actually resolved.
  if (editableIntent && (!hydrated || isLoading)) {
    return true;
  }

  return editableIntent && canEdit;
}

export function useCanUserEdit(spaceId: string) {
  const { canEdit } = useAccessControl(spaceId);

  return canEdit;
}
