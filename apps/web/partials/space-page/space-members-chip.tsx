import pluralize from 'pluralize';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';

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
            {editor.avatarUrl ? (
              <FallbackImage value={editor.avatarUrl} sizes="12px" className="object-cover" />
            ) : (
              <Avatar size={12} value={editor.address} />
            )}
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>

      <p className="whitespace-nowrap">
        {totalMembers} {pluralize('member', totalMembers)}
      </p>
    </div>
  );
}
