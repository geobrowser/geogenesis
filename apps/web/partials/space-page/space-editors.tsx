import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

import { mockPeople } from './mock';

interface Props {
  spaceId: string;
}

export async function SpaceEditors({ spaceId }: Props) {
  const firstThreeEditors = await getFirstThreeEditors(spaceId);

  return (
    <div className="flex h-6 items-center gap-1 rounded-sm border border-grey-02 px-2 text-breadcrumb shadow-button">
      <AvatarGroup>
        {firstThreeEditors.map(editor => (
          <AvatarGroup.Item key={editor.id}>
            <Avatar priority size={12} avatarUrl={editor.avatarUrl} />
          </AvatarGroup.Item>
        ))}
      </AvatarGroup>

      <p> 3 members</p>
    </div>
  );
}

async function getFirstThreeEditors(spaceId: string) {
  return mockPeople.slice(0, 3);
}
