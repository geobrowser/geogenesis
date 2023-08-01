import * as React from 'react';

import { makeStubTriple } from '~/core/io/mocks/mock-network';
import { EntityStoreProvider } from '~/core/state/entity-page-store';

import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpacePageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';

export const runtime = 'edge';

const AVATARS = [
  'https://images.unsplash.com/photo-1615266895738-11f1371cd7e5?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3269&q=80',
  'https://images.unsplash.com/photo-1608096299210-db7e38487075?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3269&q=80',
  'https://images.unsplash.com/photo-1620336655055-088d06e36bf0?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1374&q=80',
];

const COVERS = [
  'https://images.unsplash.com/photo-1620121692029-d088224ddc74?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3732&q=80',
  'https://images.unsplash.com/photo-1620503374956-c942862f0372?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3270&q=80',
  'https://images.unsplash.com/photo-1584968124544-d10ce10dd21f?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=3271&q=80',
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2748&q=80',
];

const MOCK_PROFILE = {
  id: '0x123',
  name: 'John Doe',
  avatarUrl: AVATARS[Math.floor(Math.random() * AVATARS.length)],
  coverUrl: COVERS[Math.floor(Math.random() * COVERS.length)],
  spaceId: '0x123',
  referencedByEntities: [],
  triples: [makeStubTriple('John Doe')],
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
        <EditableHeading
          spaceId={profile.spaceId}
          entityId={profile.id}
          name={profile.name}
          triples={profile.triples}
          space
        />
        <Spacer height={12} />

        <SpacePageMetadataHeader spaceId={profile.spaceId} />

        <Spacer height={40} />

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

        <Spacer height={20} />

        {children}
      </EntityPageContentContainer>
    </EntityStoreProvider>
  );
}

async function fetchProfile() {
  return MOCK_PROFILE;
}
