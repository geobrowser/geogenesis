import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export async function SpaceEditorsDialogServerContainer({ spaceId }: { spaceId: string }) {
  const { allEditors, totalEditors } = await getEditorsForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">{totalEditors} editors</h1>}
      trigger={<p className="px-3 py-2">Manage editors</p>}
      content={<SpaceMembersManageDialogContent members={allEditors} />}
    />
  );
}
