import pluralize from 'pluralize';

import { Subgraph } from '~/core/io';
import { Params } from '~/core/params';
import { OmitStrict, Profile } from '~/core/types';

import { Avatar } from '~/design-system/avatar';
import { AvatarGroup } from '~/design-system/avatar-group';

interface Props {
  spaceId: string;
}

export async function SpaceMembers({ spaceId }: Props) {
  const { firstThreeEditors, totalMembers } = await getMembersForSpace(spaceId);

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
        {totalMembers} {pluralize('member', totalMembers)}
      </p>
    </div>
  );
}

type MembersForSpace = {
  firstThreeEditors: OmitStrict<Profile, 'name' | 'coverUrl'>[];
  totalMembers: number;
};

async function getMembersForSpace(spaceId: string): Promise<MembersForSpace> {
  const config = Params.getConfigFromParams({}, undefined);
  const space = await Subgraph.fetchSpace({ endpoint: config.subgraph, id: spaceId });

  if (!space) {
    throw new Error("Space doesn't exist");
  }

  // For now we use editors for both editors and members until we have the new membership
  // model in place.
  const maybeEditorsProfiles = await Promise.all(
    space.editors.map(editor => Subgraph.fetchProfile({ endpoint: config.subgraph, address: editor }))
  );

  const profiles = maybeEditorsProfiles.flatMap(p => (p ? [p] : []));

  const firstThreeEditors = profiles.slice(0, 3).map(profile => ({
    id: profile[1].id,
    avatarUrl: profile[1].avatarUrl,
  }));

  return {
    firstThreeEditors,

    // For now a member might not have a profile, so we only show the count
    // for members with profiles.
    totalMembers: profiles.length,
  };
}
