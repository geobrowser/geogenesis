import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { notFound } from 'next/navigation';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { fetchCommunityCalls } from '~/core/community-calls/fetch-community-calls';
import { EntityId } from '~/core/io/substream-schema';
import { EditorProvider, Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { sortRelations } from '~/core/utils/utils';

import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { EditableSpaceHeading } from '~/partials/entity-page/editable-space-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageInlineDescription } from '~/partials/entity-page/entity-page-inline-description';
import { PersonalProfileBioStarterMerge } from '~/partials/entity-page/personal-profile-bio-starter-merge';
import { PersonalProfileSuggestedCard } from '~/partials/entity-page/personal-profile-suggested-card';
import { PersonalProfileSuggestedTaskSync } from '~/partials/entity-page/personal-profile-suggested-task-sync';
import { TypeSchemaInline } from '~/partials/entity-page/type-schema-inline';
import { AddDataPanel } from '~/partials/space-page/add-data-panel';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';
import { SpaceTabs } from '~/partials/space-page/space-tabs';

import { cachedFetchEntitiesBatch } from '../../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from '../cached-fetch-space';

type LayoutProps = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export default async function Layout(props0: LayoutProps) {
  const params = await props0.params;

  const { children } = props0;

  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const [props, communityCalls] = await Promise.all([getSpaceFrontPage(spaceId), fetchCommunityCalls(spaceId)]);

  const typeIds = props.space?.entity?.types?.map(t => t.id) ?? [];
  const contentVariant = communityCalls.length > 0 ? 'with-sidebar' : 'content';

  return (
    <EntityStoreProvider id={props.id} spaceId={spaceId}>
      <EditorProvider
        id={props.id}
        spaceId={spaceId}
        initialBlockRelations={props.blockRelations}
        initialBlocks={props.blocks}
        initialTabs={props.tabs}
        initialCollectionItems={props.initialCollectionItems}
      >
        <EntityPageCover avatarUrl={props.avatarUrl} coverUrl={props.coverUrl} />
        <EntityPageContentContainer variant={contentVariant}>
          <div className="space-y-2">
            <EditableSpaceHeading spaceId={spaceId} entityId={props.id} />
            <EntityPageInlineDescription entityId={props.id} spaceId={spaceId} />
            <SpacePageMetadataHeader
              spaceId={spaceId}
              membersComponent={
                <div className="flex items-center gap-2">
                  <React.Suspense fallback={<MembersSkeleton />}>
                    <SpaceEditors spaceId={spaceId} />
                  </React.Suspense>
                  <React.Suspense fallback={null}>
                    <SpaceMembers spaceId={spaceId} />
                  </React.Suspense>
                </div>
              }
            />
          </div>

          <div className="mt-6 flex flex-col gap-6">
            <AddDataPanel spaceId={spaceId} />

            {typeIds.includes(SystemIds.PERSON_TYPE) ? (
              <>
                <PersonalProfileBioStarterMerge entityId={props.id} spaceId={spaceId} />
                <PersonalProfileSuggestedTaskSync entityId={props.id} spaceId={spaceId} />
                <PersonalProfileSuggestedCard spaceId={spaceId} entityId={props.id} withBottomSpacing={false} />
              </>
            ) : null}
            <TypeSchemaInline entityId={props.id} spaceId={spaceId} />
            <React.Suspense fallback={null}>
              <SpaceTabs
                spaceId={spaceId}
                entityId={props.id}
                initialTabRelations={props.tabRelations ?? []}
                tabEntities={props.tabEntities}
                typeIds={typeIds}
              />
            </React.Suspense>
          </div>
        </EntityPageContentContainer>
        <Spacer height={20} />
        {children}
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
      initialCollectionItems: {},
      space: null,
      avatarUrl: null,
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
      const tabBlockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
      const tabBlockEntityIds = tabBlockRelations.map(r => r.toEntity.id);
      const tabBlockRelationEntityIds = tabBlockRelations.map(r => r.entityId).filter(Boolean);
      const allTabBlockIds = [...new Set([...tabBlockEntityIds, ...tabBlockRelationEntityIds])];

      const blocks = allTabBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allTabBlockIds) : [];
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

  const blockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
  const blockEntityIds = blockRelations.map(r => r.toEntity.id);
  const blockRelationEntityIds = blockRelations.map(r => r.entityId).filter(Boolean);
  const allBlockIds = [...new Set([...blockEntityIds, ...blockRelationEntityIds])];

  const blocks = allBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allBlockIds) : [];

  const allBlocks = [...blocks, ...tabBlocks.flat()];
  const allBlockRelations = [
    ...blockRelations,
    ...tabEntities.flatMap(tabEntity => tabEntity.relations.filter(r => r.type.id === SystemIds.BLOCKS)),
  ];
  const initialCollectionItems = await fetchCollectionItemsForBlocks(
    allBlocks,
    cachedFetchEntitiesBatch,
    spaceId,
    allBlockRelations
  );

  return {
    id: entity.id,
    tabEntities,
    tabRelations,
    tabs,
    blockRelations: entity.relations,
    blocks,
    initialCollectionItems,
    space,
    avatarUrl: Entities.avatar(entity.relations) ?? null,
    coverUrl: Entities.cover(entity.relations) ?? null,
  };
};
