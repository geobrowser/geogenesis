import { type SpaceParticipantsPage } from '~/core/space-members/fetch-space-participants-page';

import { SpaceEditorsManageDialogContent } from './space-editors-manage-dialog-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';

export function SpaceEditorsDialogServerContainer({
  spaceId,
  initialParticipantsPage,
}: {
  spaceId: string;
  initialParticipantsPage?: SpaceParticipantsPage;
}) {
  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage editors</h1>}
      trigger={<p>Manage editors</p>}
      content={<SpaceEditorsManageDialogContent spaceId={spaceId} initialParticipantsPage={initialParticipantsPage} />}
    />
  );
}
