import type { Source } from '~/core/blocks/data/source';

type Args = {
  isEditing: boolean;
  canEdit: boolean;
  sourceType: Source['type'];
  singleSpaceTarget: string | null;
  singleSpaceAccessResolved: boolean;
  canCreateInSingleSpace: boolean;
};

export function shouldShowCreateEntityAction({
  isEditing,
  canEdit,
  sourceType,
  singleSpaceTarget,
  singleSpaceAccessResolved,
  canCreateInSingleSpace,
}: Args): boolean {
  if (!isEditing || !canEdit || sourceType === 'RELATIONS') {
    return false;
  }

  return singleSpaceTarget === null || (singleSpaceAccessResolved && canCreateInSingleSpace);
}
