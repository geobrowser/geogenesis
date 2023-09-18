import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceEditorsChip } from './space-editors-chip';
import { SpaceEditorsContent } from './space-editors-popover-content';
import { SpaceMembersManageDialog } from './space-members-manage-dialog';
import { SpaceMembersManageDialogContent } from './space-members-manage-dialog-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';

interface Props {
  spaceId: string;
}

export async function SpaceEditors({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const { isEditor, totalEditors, allEditors } = await getEditorsForSpace(spaceId, connectedAddress);

  if (isEditor) {
    return (
      <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button transition-colors duration-150 focus-within:border-text">
        <SpaceMembersPopover
          // @ts-expect-error async JSX function
          trigger={<SpaceEditorsChip spaceId={spaceId} />}
          // @ts-expect-error async JSX function
          content={<SpaceEditorsContent spaceId={spaceId} />}
        />
        <div className="h-4 w-px bg-divider" />

        <SpaceMembersMenu
          trigger={<ChevronDownSmall color="grey-04" />}
          manageMembersComponent={
            <SpaceMembersManageDialog
              header={<h1 className="text-smallTitle">{totalEditors} editors</h1>}
              trigger={<p className="px-3 py-2">Manage editors</p>}
              content={<SpaceMembersManageDialogContent members={allEditors} />}
            />
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
      <SpaceMembersPopover
        // @ts-expect-error async JSX function
        trigger={<SpaceEditorsChip spaceId={spaceId} />}
        // @ts-expect-error async JSX function
        content={<SpaceEditorsContent spaceId={spaceId} />}
      />
    </div>
  );
}
