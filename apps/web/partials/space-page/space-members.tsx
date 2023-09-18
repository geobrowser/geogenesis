import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { SmallButton, SquareButton } from '~/design-system/button';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';

import { getEditorsForSpace } from './get-editors-for-space';
import { MemberRow } from './space-member-row';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersContent } from './space-members-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';

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
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
        <SpaceMembersPopover
          // @ts-expect-error async JSX function
          trigger={<SpaceMembersChip spaceId={spaceId} />}
          // @ts-expect-error async JSX function
          content={<SpaceMembersContent spaceId={spaceId} />}
        />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          manageMembersComponent={
            <SpaceMembersManageDialog
              header={
                <div className="flex items-center justify-between">
                  <h1 className="text-smallTitle">{totalMembers} members</h1>
                  <SquareButton icon="close" />
                </div>
              }
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
        // @ts-expect-error async JSX function
        content={<SpaceMembersContent spaceId={spaceId} />}
      />
      <div className="h-4 w-px bg-divider" />

      <p className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text">Join</p>
    </div>
  );
}
