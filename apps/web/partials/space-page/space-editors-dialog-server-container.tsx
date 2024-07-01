import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceEditorsManageDialogContent } from './space-editors-manage-dialog-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';

export async function SpaceEditorsDialogServerContainer({
  spaceId,
  votingPluginAddress,
}: {
  spaceId: string;
  votingPluginAddress: string | null;
}) {
  const { allEditors, totalEditors } = await getEditorsForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">{totalEditors} editors</h1>}
      trigger={<p className="px-3 py-2">Manage editors</p>}
      content={<SpaceEditorsManageDialogContent members={allEditors} votingPluginAddress={votingPluginAddress} />}
    />
  );
}
