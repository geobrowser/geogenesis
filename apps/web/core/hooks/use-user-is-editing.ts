'use client';

import { useEditable } from '../state/editable-store';
import { useAccessControl } from './use-access-control';

export function useUserIsEditing(spaceId: string) {
  const { editable } = useEditable();
  const { isEditor, isMember } = useAccessControl(spaceId);

  return true;

  return editable && (isEditor || isMember);
}

export function useCanUserEdit(spaceId: string) {
  const { isEditor, isMember } = useAccessControl(spaceId);

  return isEditor || isMember;
}
