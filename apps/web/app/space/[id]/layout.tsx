import { SYSTEM_IDS } from '@geogenesis/ids';
import { redirect } from 'next/navigation';

import * as React from 'react';

import { Subgraph } from '~/core/io';
import { EditorProvider } from '~/core/state/editor-store';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TypesStoreServerContainer } from '~/core/state/types-store/types-store-server-container';
import { Entity } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { Value } from '~/core/utils/value';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';

import { SpaceConfigProvider } from './space-config-provider';

interface Props {
  params: { id: string };
  children: React.ReactNode;
}

export default async function Layout({ children, params }: Props) {
  const props = await getData(params.id);
  const coverUrl = Entity.cover(props.triples);

  return (
    <SpaceConfigProvider spaceId={params.id}>
      <TypesStoreServerContainer spaceId={params.id}>
        <EntityStoreProvider id={props.id} spaceId={props.spaceId} initialTriples={props.triples}>
          <EditorProvider
            id={props.id}
            spaceId={props.spaceId}
            initialBlockIdsTriple={props.blockIdsTriple}
            initialBlockTriples={props.blockTriples}
          >
            <EntityPageCover avatarUrl={null} coverUrl={coverUrl} space />

            <EntityPageContentContainer>
              <EditableHeading spaceId={props.spaceId} entityId={props.id} name={props.name} triples={props.triples} />
              <SpacePageMetadataHeader
                spaceId={props.spaceId}
                membersComponent={
                  <React.Suspense fallback={<MembersSkeleton />}>
                    <SpaceEditors spaceId={params.id} />
                    <SpaceMembers spaceId={params.id} />
                  </React.Suspense>
                }
              />

              <Spacer height={40} />
              <TabGroup
                tabs={[
                  {
                    label: 'Overview',
                    href: `${NavUtils.toSpace(params.id)}`,
                  },
                  {
                    label: 'Governance',
                    href: `${NavUtils.toSpace(params.id)}/governance`,
                  },
                ]}
              />
              <Spacer height={20} />

              {children}
            </EntityPageContentContainer>
          </EditorProvider>
        </EntityStoreProvider>
      </TypesStoreServerContainer>
    </SpaceConfigProvider>
  );
}

function MembersSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-6 w-36" />
    </div>
  );
}

const getData = async (spaceId: string) => {
  const space = await Subgraph.fetchSpace({ id: spaceId });

  const entity = space?.spaceConfig;

  if (!entity) {
    console.log(`Redirecting to /space/${spaceId}/entities`);
    redirect(`/space/${spaceId}/entities`);
  }

  // @HACK: Entities we are rendering might be in a different space. Right now there's a bug where we aren't
  // fetching the space for the entity we are rendering, so we need to redirect to the correct space.
  if (entity?.nameTripleSpace) {
    if (spaceId !== entity?.nameTripleSpace) {
      console.log('Redirecting to space from space configuration entity', entity?.nameTripleSpace);
      redirect(`/space/${entity?.nameTripleSpace}/${entity.id}`);
    }
  }

  const spaceName = space?.spaceConfig?.name ? space.spaceConfig?.name : space?.id ?? '';

  const blockIdsTriple = entity?.triples.find(t => t.attributeId === SYSTEM_IDS.BLOCKS) || null;
  const blockIds: string[] = blockIdsTriple ? JSON.parse(Value.stringValue(blockIdsTriple) || '[]') : [];

  const blockTriples = (
    await Promise.all(
      blockIds.map(blockId => {
        return Subgraph.fetchEntity({ id: blockId });
      })
    )
  ).flatMap(entity => entity?.triples ?? []);

  return {
    triples: entity?.triples ?? [],
    id: entity.id,
    name: entity?.name ?? spaceName ?? '',
    description: Entity.description(entity?.triples ?? []),
    spaceId,

    // For entity page editor
    blockIdsTriple,
    blockTriples,

    space,
  };
};
