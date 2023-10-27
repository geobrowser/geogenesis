import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export async function SpaceMembersDialogServerContainer({ spaceId }: { spaceId: string }) {
  const { allEditors: allMembers, totalEditors: totalMembers } = await getEditorsForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">{totalMembers} members</h1>}
      trigger={<p className="px-3 py-2">Manage members</p>}
      content={<SpaceMembersManageDialogContent members={allMembers} />}
    />
  );
}
