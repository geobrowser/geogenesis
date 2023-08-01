import * as React from 'react';

import { EntityStoreProvider } from '~/core/state/entity-page-store';

import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';

export const runtime = 'edge';

const MOCK_PROFILE = {
  id: '0x123',
  name: 'John Doe',
  avatarUrl: 'https://avatars.githubusercontent.com/u/10001?v=4',
  coverUrl: 'https://avatars.githubusercontent.com/u/10002?v=4',
  spaceId: '0x123',
};

const TABS = ['Overview', 'Work', 'Education', 'Activity'] as const;

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function ProfileLayout({ children, params }: Props) {
  const profile = await fetchProfile();

  return (
    <EntityStoreProvider
      id={profile.id}
      spaceId={profile.spaceId}
      initialTriples={[]}
      initialSchemaTriples={[]}
      initialBlockIdsTriple={null}
      initialBlockTriples={[]}
    >
      <EntityPageCover avatarUrl={profile.avatarUrl} coverUrl={profile.coverUrl} />

      <EntityPageContentContainer>
        <EditableHeading spaceId={profile.spaceId} entityId={profile.id} name={profile.name} triples={[]} space />

        <TabGroup
          tabs={TABS.map(label => {
            const href =
              label === 'Overview' ? `/profile/${params.id}` : `/profile/${params.id}/${label.toLowerCase()}`;
            return {
              href,
              label,
            };
          })}
        />

        {children}
      </EntityPageContentContainer>
    </EntityStoreProvider>
  );
}

async function fetchProfile() {
  return MOCK_PROFILE;
}
