import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';
import { EditorProvider, Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { sortRelations } from '~/core/utils/utils';

import { Create } from '~/design-system/icons/create';
import { MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { EditableSpaceHeading } from '~/partials/entity-page/editable-space-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { AddSubspaceDialog } from '~/partials/space-page/add-subspace-dialog';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';
import { SpaceTabs } from '~/partials/space-page/space-tabs';

import { cachedFetchEntitiesBatch } from '../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from './cached-fetch-space';

type LayoutProps = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export default async function Layout(props0: LayoutProps) {
  const params = await props0.params;

  const { children } = props0;

  const spaceId = params.id;

  const props = await getSpaceFrontPage(spaceId);

  const typeIds = props.space?.entity?.types?.map(t => t.id) ?? [];

  return (
    <EntityStoreProvider id={props.id} spaceId={spaceId}>
      <EditorProvider
        id={props.id}
        spaceId={spaceId}
        initialBlockRelations={props.blockRelations}
        initialBlocks={props.blocks}
        initialTabs={props.tabs}
      >
        <EntityPageCover avatarUrl={null} coverUrl={props.coverUrl} />
        <EntityPageContentContainer>
          <div className="space-y-2">
            <EditableSpaceHeading
              spaceId={spaceId}
              entityId={props.id}
              addSubspaceComponent={
                <AddSubspaceDialog
                  spaceId={spaceId}
                  trigger={
                    <MenuItem>
                      <Create />
                      <p>Add subspace</p>
                    </MenuItem>
                  }
                  spaceType={props.space?.type ?? 'PERSONAL'}
                />
              }
            />
            <SpacePageMetadataHeader
              spaceId={spaceId}
              entityId={props.id}
              membersComponent={
                <React.Suspense fallback={<MembersSkeleton />}>
                  <SpaceEditors spaceId={spaceId} />
                  <SpaceMembers spaceId={spaceId} />
                </React.Suspense>
              }
            />
          </div>

          <Spacer height={40} />
          <React.Suspense fallback={null}>
            <SpaceTabs
              spaceId={spaceId}
              entityId={props.id}
              initialTabRelations={props.tabRelations ?? []}
              tabEntities={props.tabEntities}
              typeIds={typeIds}
            />
          </React.Suspense>
          <Spacer height={20} />
          {children}
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
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

const getSpaceFrontPage = async (spaceId: string) => {
  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      id: IdUtils.generate(),
      spaces: [spaceId],
      tabEntities: [],
      tabs: {},
      blockRelations: [],
      blocks: [],
      space: null,
      coverUrl: null,
    };
  }

  const tabRelations = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY) ?? [];
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);

  const fetchedTabEntities = tabIds ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // Re-order entities to match the sorted tabIds order (batch fetch doesn't preserve order)
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities = tabIds.map(id => tabEntityMap.get(id)).filter((e): e is NonNullable<typeof e> => e != null);

  const tabBlocks = await Promise.all(
    tabEntities.map(async entity => {
      const blockIds = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS)?.map(r => r.toEntity.id);

      const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];
      return blocks;
    })
  );

  const tabs: Tabs = {};

  tabEntities.forEach((entity, index) => {
    tabs[entity.id as EntityId] = {
      entity,
      blocks: tabBlocks[index],
    };
  });

  const blockIds = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS)?.map(r => r.toEntity.id);

  const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

  return {
    id: entity.id,
    tabEntities,
    tabRelations,
    tabs,
    blockRelations: entity.relations,
    blocks,
    space,
    coverUrl: Entities.cover(entity.relations) ?? null,
  };
};
