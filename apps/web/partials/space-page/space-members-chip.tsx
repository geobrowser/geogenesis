import pluralize from 'pluralize';

import { type SpaceParticipantProfile } from '~/core/space-members/fetch-space-participants-page';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';

interface Props {
  firstThreeMembers: SpaceParticipantProfile[];
  totalMembers: number;
}

export function SpaceMembersChip({ firstThreeMembers, totalMembers }: Props) {
  return (
    <div className="flex items-center gap-1">
      <AvatarGroup>
        {firstThreeMembers.map(member => (
          <AvatarGroup.Item key={member.id}>
            {member.avatarUrl ? (
              <FallbackImage value={member.avatarUrl} sizes="12px" className="object-cover" priority />
            ) : (
              <Avatar size={12} value={member.address} />
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
