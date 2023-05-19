import { useAccessControl } from '../auth/use-access-control';
import { useEditable } from '../stores/use-editable';

export function useUserCanEdit(spaceId?: string) {
  const { editable } = useEditable();
  const { isEditor } = useAccessControl(spaceId);

  return editable && isEditor;
}
