import { SpaceGovernanceType } from '~/core/types';

import { getMembersForSpace } from './get-members-for-space';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';

export async function SpaceMembersDialogServerContainer({
  spaceType,
  spaceId,
  votingPluginAddress,
}: {
  spaceType: SpaceGovernanceType;
  spaceId: string;
  votingPluginAddress: string | null;
}) {
  const { allMembers } = await getMembersForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      trigger={<p className="px-3 py-2">Manage members</p>}
      content={
        <SpaceMembersManageDialogContent
          spaceType={spaceType}
          members={allMembers}
          votingPluginAddress={votingPluginAddress}
        />
      }
    />
  );
}
