import { SpaceGovernanceType } from '~/core/types';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceEditorsManageDialogContent } from './space-editors-manage-dialog-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';

export async function SpaceEditorsDialogServerContainer({
  spaceType,
  spaceId,
  votingPluginAddress,
}: {
  spaceType: SpaceGovernanceType;
  spaceId: string;
  votingPluginAddress: string | null;
}) {
  const { allEditors } = await getEditorsForSpace(spaceId);

  return (
    <SpaceMembersManageDialog
      trigger={<p className="px-3 py-2">Manage editors</p>}
      content={
        <SpaceEditorsManageDialogContent
          spaceType={spaceType}
          members={allEditors}
          votingPluginAddress={votingPluginAddress}
        />
      }
    />
  );
}
