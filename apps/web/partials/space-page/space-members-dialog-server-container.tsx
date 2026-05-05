import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export function SpaceMembersDialogServerContainer({
  spaceId,
  initialTotalMembers,
}: {
  spaceId: string;
  initialTotalMembers: number;
}) {
  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage members</h1>}
      trigger={<p>Manage members</p>}
      content={<SpaceMembersManageDialogContent spaceId={spaceId} initialTotalMembers={initialTotalMembers} />}
    />
  );
}
