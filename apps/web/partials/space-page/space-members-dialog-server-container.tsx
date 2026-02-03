import { SpaceGovernanceType } from '~/core/types';

import { getMembersForSpace } from './get-members-for-space';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export async function SpaceMembersDialogServerContainer({
  spaceType,
  spaceId,
}: {
  spaceType: SpaceGovernanceType;
  spaceId: string;
}) {
  const { allMembers } = await getMembersForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      header={<h1 className="text-smallTitle">Manage members</h1>}
      trigger={<p>Manage members</p>}
      content={<SpaceMembersManageDialogContent spaceId={spaceId} members={allMembers} />}
    />
  );
}
