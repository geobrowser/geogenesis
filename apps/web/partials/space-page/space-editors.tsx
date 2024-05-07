import { cookies } from 'next/headers';

import * as React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getIsEditorForSpace } from './get-is-editor-for-space';
import { SpaceEditorsChip } from './space-editors-chip';
import { SpaceEditorsDialogServerContainer } from './space-editors-dialog-server-container';
import { SpaceEditorsContent } from './space-editors-popover-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
}

export async function SpaceEditors({ spaceId }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const [isEditor, space] = await Promise.all([
    getIsEditorForSpace(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
    // @TODO: Check if the user has already requested to be an editor
  ]);

  if (!space) {
    return null;
  }

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover
          trigger={<SpaceEditorsChip spaceId={spaceId} />}
          content={
            <React.Suspense>
              <SpaceEditorsContent spaceId={spaceId} />
            </React.Suspense>
          }
        />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          trigger={<ChevronDownSmall color="grey-04" />}
          manageMembersComponent={
            <React.Suspense>
              <SpaceEditorsDialogServerContainer
                spaceId={spaceId}
                votingPluginAddress={space.mainVotingPluginAddress}
              />
            </React.Suspense>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover
        trigger={<SpaceEditorsChip spaceId={spaceId} />}
        content={
          <React.Suspense>
            <SpaceEditorsContent spaceId={spaceId} />
          </React.Suspense>
        }
      />
    </div>
  );
}
