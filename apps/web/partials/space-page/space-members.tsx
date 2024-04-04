import { cookies } from 'next/headers';

import * as React from 'react';

import { WALLET_ADDRESS } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getIsEditorForSpace } from './get-is-editor-for-space';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersDialogServerContainer } from './space-members-dialog-server-container';
import { SpaceMembersJoinButton } from './space-members-join-button';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { SpaceMembersContent } from './space-members-popover-content';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = cookies().get(WALLET_ADDRESS)?.value;
  const [isEditor, space] = await Promise.all([
    getIsEditorForSpace(spaceId, connectedAddress),
    cachedFetchSpace(spaceId),
    // @TODO: Check if the user has already requested to be a member
  ]);

  const memberAccessPlugin = space?.memberAccessPluginAddress ?? null;

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover
          trigger={<SpaceMembersChip spaceId={spaceId} />}
          content={
            <React.Suspense>
              <SpaceMembersContent spaceId={spaceId} />
            </React.Suspense>
          }
        />
        <div className="h-4 w-px bg-divider" />
        <SpaceMembersMenu
          manageMembersComponent={
            <React.Suspense>
              <SpaceMembersDialogServerContainer spaceId={spaceId} />
            </React.Suspense>
          }
          trigger={<ChevronDownSmall color="grey-04" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
      <SpaceMembersPopover
        trigger={<SpaceMembersChip spaceId={spaceId} />}
        content={
          <React.Suspense>
            <SpaceMembersContent spaceId={spaceId} />
          </React.Suspense>
        }
      />
      <div className="h-4 w-px bg-divider" />

      <SpaceMembersJoinButton spaceId={spaceId} memberAccessPluginAddress={memberAccessPlugin} />
    </div>
  );
}
