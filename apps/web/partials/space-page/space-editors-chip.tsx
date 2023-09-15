import { cookies } from 'next/headers';
import pluralize from 'pluralize';

import { Cookie } from '~/core/cookie';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import { getEditorsForSpace } from './get-editors-for-space';

interface Props {
  spaceId: string;
}

export async function SpaceEditorsChip({ spaceId }: Props) {
  const connectedAddress = cookies().get(Cookie.WALLET_ADDRESS)?.value;

  // For now we use editors for both editors and members until we have the new membership
  const { firstThreeEditors, totalEditors } = await getEditorsForSpace(spaceId, connectedAddress);

  return (
    <div className="flex items-center gap-1">
      <AvatarGroup>
        {firstThreeEditors.map(editor => (
          <AvatarGroup.Item key={editor.id}>
            <Avatar priority size={12} avatarUrl={editor.avatarUrl} value={editor.id} />
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>

      <p>
        {totalEditors} {pluralize('editor', totalEditors)}
      </p>
    </div>
  );
}
