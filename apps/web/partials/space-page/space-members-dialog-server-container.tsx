import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export function SpaceMembersDialogServerContainer({ spaceId }: { spaceId: string }) {
  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage members</h1>}
      trigger={<p>Manage members</p>}
      content={<SpaceMembersManageDialogContent spaceId={spaceId} />}
    />
  );
}
