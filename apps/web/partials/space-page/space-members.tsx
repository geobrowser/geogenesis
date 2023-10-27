import { cookies } from 'next/headers';

import * as React from 'react';

import { Cookie } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getIsEditorForSpace } from './get-is-editor-for-space';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersDialogServerContainer } from './space-members-dialog-server-container';
import { SpaceMembersJoinButton } from './space-members-join-button';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { SpaceMembersContent } from './space-members-popover-content';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const isEditor = await getIsEditorForSpace(spaceId, connectedAddress);

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

      <SpaceMembersJoinButton spaceId={spaceId} />
    </div>
  );
}
