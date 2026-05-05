import { SpaceEditorsManageDialogContent } from './space-editors-manage-dialog-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';

export function SpaceEditorsDialogServerContainer({
  spaceId,
  initialTotalEditors,
}: {
  spaceId: string;
  initialTotalEditors: number;
}) {
  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage editors</h1>}
      trigger={<p>Manage editors</p>}
      content={<SpaceEditorsManageDialogContent spaceId={spaceId} initialTotalEditors={initialTotalEditors} />}
    />
  );
}
