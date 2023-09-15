import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import { getEditorsForSpace } from './get-editors-for-space';
import { SpaceMembersMenu } from './space-members-menu';

interface Props {
  spaceId: string;
}

export async function SpaceMembersChip({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;
  // For now we use editors for both editors and members until we have the new membership

  const {
    firstThreeEditors,
    totalEditors: totalMembers,
    isEditor,
  } = await getEditorsForSpace(spaceId, connectedAddress);

  console.log('connectedAddress', { connectedAddress, isEditor });

  return (
    <div className="flex h-6 items-center gap-1.5 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
      <div className="flex items-center gap-1">
        <AvatarGroup>
          {firstThreeEditors.map(editor => (
            <AvatarGroup.Item key={editor.id}>
              <Avatar priority size={12} avatarUrl={editor.avatarUrl} value={editor.id} />
            </AvatarGroup.Item>
          ))}
        </AvatarGroup>

        <p>
          {totalMembers} {pluralize('member', totalMembers)}
        </p>
      </div>

      <div className="h-4 w-px bg-divider" />

      <p className="text-grey-04 transition-colors duration-75 hover:cursor-pointer hover:text-text">
        {isEditor ? <SpaceMembersMenu /> : 'Join'}
      </p>
    </div>
  );
}
