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
      header={<h1 className="text-smallTitle">Manage editors</h1>}
      trigger={<p>Manage editors</p>}
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
