import { cookies } from 'next/headers';

import { Cookie } from '~/core/cookie';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersChip } from './space-members-chip';
import { SpaceMembersContent } from './space-members-content';
import { SpaceMembersMenu } from './space-members-menu';
import { SpaceMembersPopover } from './space-members-popover';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  const { isEditor } = await getEditorsForSpace(spaceId, connectedAddress);

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

        <SpaceMembersMenu trigger={<ChevronDownSmall color="grey-04" />} />
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
