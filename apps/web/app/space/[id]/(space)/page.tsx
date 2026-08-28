import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import type { Metadata } from 'next';

import { notFound } from 'next/navigation';

import { fetchShownPropertyEntitiesForBlocks } from '~/core/blocks/data/fetch-block-shown-properties';
import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { firstLine } from '~/core/opengraph';
import { RouteEditorProvider, type Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { sortRelations } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';

import { Editor } from '~/partials/editor/editor';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageSidebarLayout } from '~/partials/entity-page/entity-page-sidebar-layout';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';
import { RootExploreSidePanelContainer } from '~/partials/explore/root-explore-side-panel-container';
import { SpaceOverviewSidePanel } from '~/partials/space-page/space-overview-side-panel';
import { SubtopicGalleryServerContainer } from '~/partials/space-page/subtopic-gallery-server-container';

import { cachedFetchEntitiesBatch, cachedFetchEntityPage } from '../../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from '../cached-fetch-space';
import { resolveSpaceSidebar } from './space-sidebar';

interface Props {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tabId?: string | string[] }>;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params;
  const spaceId = params.id;

  if (!IdUtils.isValid(spaceId)) {
    return { title: 'Not Found' };
  }

  const space = await cachedFetchSpace(spaceId);
  const entity = space?.entity;

  if (!entity) {
    return {
      title: `Space ${spaceId}`,
      description: 'No entity found for this space.',
    };
  }

  const entityName = entity.name ?? null;
  const description = firstLine(Entities.description(entity.values ?? []));

  return {
    title: entityName ?? spaceId,
    description,
  };
}

export default async function SpacePage(props0: Props) {
  const params = await props0.params;
  const searchParams = (await props0.searchParams) ?? {};
  const spaceId = params.id;
  const tabId = typeof searchParams.tabId === 'string' ? searchParams.tabId : undefined;

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const space = await cachedFetchSpace(spaceId);

  if (Spaces.hasExternalTopic(space)) {
    return <TopicEntityBody spaceId={spaceId} topicEntityId={space.topicId} />;
  }

  const [props, { isRootSpace, communityCalls }] = await Promise.all([
    getSpaceFrontPage(space),
    resolveSpaceSidebar(spaceId),
  ]);

  let sidebar: React.ReactNode = null;
  if (!tabId) {
    if (isRootSpace) {
      sidebar = (
        <React.Suspense fallback={null}>
          <RootExploreSidePanelContainer />
        </React.Suspense>
      );
    } else {
      sidebar = <SpaceOverviewSidePanel spaceId={spaceId} dailyActivities communityCalls={communityCalls} />;
    }
  }

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
      <React.Suspense fallback={<SubtopicGallerySkeleton />}>
        <SubtopicGalleryServerContainer spaceId={params.id} />
      </React.Suspense>
      <React.Suspense fallback={null}>
        <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      </React.Suspense>
      <Spacer height={24} />
      <ToggleEntityPage id={props.id} spaceId={spaceId} />
      <Spacer height={40} />
      {/*
        Some SEO parsers fail to parse meta tags if there's no fallback in a suspense
        boundary. We don't want to show any referenced by loading states but do want to
        stream it in
      */}
      <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
        <React.Suspense fallback={<div />}>
          <BacklinksServerContainer entityId={props.id} />
        </React.Suspense>
      </TrackedErrorBoundary>
    </EntityPageSidebarLayout>
  );
}

async function TopicEntityBody({ spaceId, topicEntityId }: { spaceId: string; topicEntityId: string }) {
  const topic = await getTopicEntityData(spaceId, topicEntityId);

  return (
    <EntityStoreProvider id={topicEntityId} spaceId={spaceId}>
      <RouteEditorProvider
        id={topicEntityId}
        spaceId={spaceId}
        initialBlocks={topic.blocks}
        initialBlockRelations={topic.blockRelations}
        initialTabs={topic.tabs}
        initialCollectionItems={topic.initialCollectionItems}
      >
        <EntityPageContentContainer>
          <React.Suspense fallback={<SubtopicGallerySkeleton />}>
            <SubtopicGalleryServerContainer spaceId={spaceId} />
          </React.Suspense>
          <React.Suspense fallback={null}>
            <Editor spaceId={spaceId} shouldHandleOwnSpacing />
          </React.Suspense>
          <Spacer height={24} />
          <ToggleEntityPage id={topicEntityId} spaceId={spaceId} />
          <Spacer height={40} />
          <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
            <React.Suspense fallback={<div />}>
              <BacklinksServerContainer entityId={topicEntityId} />
            </React.Suspense>
          </TrackedErrorBoundary>
        </EntityPageContentContainer>
      </RouteEditorProvider>
    </EntityStoreProvider>
  );
}

async function getTopicEntityData(spaceId: string, topicEntityId: string) {
  const result = await cachedFetchEntityPage(topicEntityId, spaceId);
  const entity = result?.entity;

  if (!entity) {
    return {
      blocks: [],
      blockRelations: [],
      tabs: {},
      initialCollectionItems: {},
    };
  }

  const blockRelations = entity.relations.filter(r => r.type.id === SystemIds.BLOCKS);
  const blockEntityIds = blockRelations.map(r => r.toEntity.id);
  const blockRelationEntityIds = blockRelations.map(r => r.entityId).filter(Boolean);
  const allBlockIds = [...new Set([...blockEntityIds, ...blockRelationEntityIds])];
  const blocks = allBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allBlockIds, spaceId) : [];

  const tabRelations = entity.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY);
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);
  const fetchedTabEntities = tabIds.length > 0 ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities = tabIds.map(id => tabEntityMap.get(id)).filter((e): e is NonNullable<typeof e> => e != null);

  const tabBlocks = await Promise.all(
    tabEntities.map(async entity => {
      const tabBlockRelations = entity.relations.filter(r => r.type.id === SystemIds.BLOCKS);
      const tabBlockEntityIds = tabBlockRelations.map(r => r.toEntity.id);
      const tabBlockRelationEntityIds = tabBlockRelations.map(r => r.entityId).filter(Boolean);
      const allTabBlockIds = [...new Set([...tabBlockEntityIds, ...tabBlockRelationEntityIds])];
      return allTabBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allTabBlockIds, spaceId) : [];
    })
  );

  const tabs: Tabs = {};
  tabEntities.forEach((entity, index) => {
    tabs[entity.id] = { entity, blocks: tabBlocks[index] };
  });

  const allBlocks = [...blocks, ...tabBlocks.flat()];
  const allBlockRelations = [
    ...blockRelations,
    ...tabEntities.flatMap(tabEntity => tabEntity.relations.filter(r => r.type.id === SystemIds.BLOCKS)),
  ];
  const [initialCollectionItems, shownPropertyEntities] = await Promise.all([
    fetchCollectionItemsForBlocks(allBlocks, cachedFetchEntitiesBatch, spaceId, allBlockRelations),
    fetchShownPropertyEntitiesForBlocks(allBlocks, cachedFetchEntitiesBatch),
  ]);

  // Shown-column properties ride along with the blocks so the editor hydrates them in the same
  // pass — a gallery needs the dimensions on them to size its cards on the first paint.
  return { blocks: [...blocks, ...shownPropertyEntities], blockRelations, tabs, initialCollectionItems };
}

const SubtopicGallerySkeleton = () => {
  return (
    <>
      <div className="h-10" />
      <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-[17px] p-1">
            <Skeleton className="aspect-2/1 w-full rounded-lg" />
            <div className="px-1">
              <Skeleton className="h-5 w-2/3 rounded" />
            </div>
          </div>
        ))}
      </div>
      <Spacer height={40} />
    </>
  );
};

const getSpaceFrontPage = async (space: Awaited<ReturnType<typeof cachedFetchSpace>>) => {
  const entity = space?.entity;

  if (!entity) {
    return {
      id: '',
      name: null,
      values: [],
      relations: [],
      spaceTypes: [],
    };
  }

  // See layout.tsx getSpaceFrontPage for the rationale (incl. why this is gated
  // to the test env). When the indexer's space record has no home entity id,
  // treat spaceId as the synthetic home-entity id AND fetch the entity at that
  // id so published values surface here (not just space.entity which is empty
  // in that case).
  if (!entity.id && space?.id && process.env.NEXT_PUBLIC_IS_TEST_ENV === 'true') {
    const synthetic = await cachedFetchEntityPage(space.id, space.id);
    const syntheticEntity = synthetic?.entity ?? null;
    return {
      id: space.id,
      name: syntheticEntity?.name ?? null,
      values: syntheticEntity?.values ?? [],
      spaceTypes: syntheticEntity?.types ?? [],
      relationsOut: syntheticEntity?.relations ?? [],
    };
  }

  return {
    name: entity?.name ?? null,
    values: entity?.values ?? [],
    id: entity.id,
    spaceTypes: space?.entity?.types ?? [],
    relationsOut: entity?.relations ?? [],
  };
};

export type SpacePageType = 'person' | 'company' | 'nonprofit';
