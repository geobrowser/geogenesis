import { type SpaceParticipantsPage } from '~/core/space-members/fetch-space-participants-page';

import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export function SpaceMembersDialogServerContainer({
  spaceId,
  initialParticipantsPage,
}: {
  spaceId: string;
  initialParticipantsPage?: SpaceParticipantsPage;
}) {
  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage members</h1>}
      trigger={<p>Manage members</p>}
      content={
        <SpaceMembersManageDialogContent
          spaceId={spaceId}
          initialParticipantsPage={initialParticipantsPage}
        />
      }
    />
  );
}
