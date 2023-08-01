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

const MOCK_PROFILE = {
  id: '0x123',
  name: 'John Doe',
  avatarUrl: 'https://avatars.githubusercontent.com/u/10001?v=4',
  coverUrl: 'https://avatars.githubusercontent.com/u/10002?v=4',
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
