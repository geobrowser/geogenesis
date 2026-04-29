import pluralize from 'pluralize';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';
import { FallbackImage } from '~/design-system/fallback-image';

import { getFirstThreeEditorsForSpace } from './get-first-three-editors-for-space';

interface Props {
  spaceId: string;
}

export async function SpaceEditorsChip({ spaceId }: Props) {
  // For now we use editors for both editors and members until we have the new membership
  const { firstThreeEditors, totalEditors } = await getFirstThreeEditorsForSpace(spaceId);

  return (
    <div className="flex items-center gap-1">
      <AvatarGroup>
        {firstThreeEditors.map(editor => (
          <AvatarGroup.Item key={editor.id}>
            {editor.avatarUrl ? (
              <FallbackImage value={editor.avatarUrl} sizes="12px" className="object-cover" priority />
            ) : (
              <Avatar size={12} value={editor.address} />
            )}
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>

      <p className="whitespace-nowrap">
        {totalEditors} {pluralize('editor', totalEditors)}
      </p>
    </div>
  );
}
