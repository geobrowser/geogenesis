import pluralize from 'pluralize';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import { getEditorsForSpace } from './get-editors-for-space';

interface Props {
  spaceId: string;
}

export async function SpaceEditorsChip({ spaceId }: Props) {
  const { firstThreeEditors, totalEditors } = await getEditorsForSpace(spaceId);

  return (
    <div className="flex h-6 items-center gap-1 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
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
