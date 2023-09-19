import { cookies } from 'next/headers';

import * as React from 'react';

import { Cookie } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';
import { SpaceMembersContent } from './space-members-popover-content';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const {
    isEditor,
    allEditors: allMembers,
    totalEditors: totalMembers,
  } = await getEditorsForSpace(spaceId, connectedAddress);

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover
          // @ts-expect-error async JSX function
          trigger={<SpaceMembersChip spaceId={spaceId} />}
          content={
            <React.Suspense>
              {/* @ts-expect-error async JSX function */}
              <SpaceMembersContent spaceId={spaceId} />
            </React.Suspense>
          }
        />
        <div className="h-4 w-px bg-divider" />
        <SpaceMembersMenu
          manageMembersComponent={
            <SpaceMembersManageDialog
              header={<h1 className="text-smallTitle">{totalMembers} members</h1>}
              trigger={<p className="px-3 py-2">Manage members</p>}
              content={<SpaceMembersManageDialogContent members={allMembers} />}
            />
          }
          trigger={<ChevronDownSmall color="grey-04" />}
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
      <SpaceMembersPopover
        // @ts-expect-error async JSX function
        trigger={<SpaceMembersChip spaceId={spaceId} />}
        content={
          <React.Suspense>
            {/* @ts-expect-error async JSX function */}
            <SpaceMembersContent spaceId={spaceId} />
          </React.Suspense>
        }
      />
      <div className="h-4 w-px bg-divider" />

      <p className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text">Join</p>
    </div>
  );
}
