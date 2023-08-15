'use client';

import { useAccessControl } from './use-access-control';
import { useEditable } from './use-editable';

export function useUserIsEditing(spaceId?: string) {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);

  return editable && isEditor;
}
