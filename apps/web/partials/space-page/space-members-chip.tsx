import pluralize from 'pluralize';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import { getFirstThreeMembersForSpace } from './get-first-three-members-for-space';

interface Props {
  spaceId: string;
}

export async function SpaceMembersChip({ spaceId }: Props) {
  // For now we use editors for both editors and members until we have the new membership
  const { firstThreeMembers, totalMembers } = await getFirstThreeMembersForSpace(spaceId);

  return (
    <div className="flex items-center gap-1">
      <AvatarGroup>
        {firstThreeMembers.map(editor => (
          <AvatarGroup.Item key={editor.id}>
            <Avatar priority size={12} avatarUrl={editor.avatarUrl} value={editor.address} />
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>

      <p>
        {totalMembers} {pluralize('member', totalMembers)}
      </p>
    </div>
  );
}
