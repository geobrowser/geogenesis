'use client';

import { useAccessControl } from './use-access-control';
import { useEditable } from '../state/editable-store';

export function useUserIsEditing(spaceId?: string) {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);

  return editable && isEditor;
}
