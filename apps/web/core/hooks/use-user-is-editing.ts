'use client';

import { useEditable } from '../state/editable-store';
import { useAccessControl } from './use-access-control';
import { useHydrated } from './use-hydrated';

export function useUserIsEditing(spaceId: string) {
  const { editable } = useEditable();
  const hydrated = useHydrated();
  const { isEditor, isMember } = useAccessControl(spaceId);

  // Before hydration, access control returns false to avoid SSR mismatches.
  // If the editable atom is already true (user was editing before navigation),
  // trust it until access control has actually resolved.
  if (editable && !hydrated) {
    return true;
  }

  return editable && (isEditor || isMember);
}

export function useCanUserEdit(spaceId: string) {
  const { isEditor, isMember } = useAccessControl(spaceId);

  return isEditor || isMember;
}
