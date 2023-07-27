'use client';

import { useEditable } from '../state/editable-store';
import { useAccessControl } from './use-access-control';

export function useUserIsEditing(spaceId?: string) {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);

  return editable && isEditor;
}
