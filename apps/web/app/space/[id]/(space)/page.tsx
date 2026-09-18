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
import { firstSearchParamValue } from '~/core/utils/search-params';
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
import { PersonalSpaceProfile } from '~/partials/profile/personal-space-profile';
import { SpaceOverviewSidePanelContainer } from '~/partials/space-page/space-overview-side-panel-container';
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
  // First value, not "only if there is exactly one". Reading this as `typeof === 'string'` turned a
  // repeated `?tabId=a&tabId=b` into `undefined`, which reads as Overview and opens the rail on
  // what the rest of the page treats as a tab — the client half never agreed, since
  // `useSearchParams().get()` returns the first value, and that is how the gallery this replaces
  // knew to hide itself.
  const tabId = firstSearchParamValue(searchParams.tabId);

  if (!IdUtils.isValid(spaceId)) {
    notFound();
  }

  const space = await cachedFetchSpace(spaceId);

  // A personal space with a person on it gets the profile page. The person is
  // `space.entity` — `topic ?? page` — because plenty of these carry the person
  // on `page` with `topicId` still null. See `isPersonProfileSpace`.
  if (space && Spaces.isPersonProfileSpace(space)) {
    return <PersonalSpaceBody space={space} topicEntityId={space.entity.id} tabId={tabId} />;
  }

  // Left on `hasExternalTopic` deliberately, dead though it is: that predicate
  // cannot return true for a space whose topic resolved — `SpaceDto` builds
  // `entity` from `topic ?? page`, so the comparison is always false — which
  // means this branch never fires for the DAO spaces it was written for. Waking
  // it is a change to every one of them, not a side effect of the profile work.
  // See `topic-predicates.test.ts`.
  if (Spaces.hasExternalTopic(space)) {
    return <TopicEntityBody spaceId={spaceId} topicEntityId={space.topicId} />;
  }

  const [props, { isRootSpace, communityCalls }] = await Promise.all([
    getSpaceFrontPage(space),
    resolveSpaceSidebar(spaceId),
  ]);

  // Overview only, which is what `!tabId` means here — a tab gets no rail, and so no subspaces
  // (GEO-2875). Both branches are containers under Suspense so the rail's query never delays the
  // page's own JSX; the gallery this replaces streamed the same way.
  let sidebar: React.ReactNode = null;
  if (!tabId) {
    sidebar = (
      <React.Suspense fallback={null}>
        {isRootSpace ? (
          <RootExploreSidePanelContainer spaceId={spaceId} includeSubspaces />
        ) : (
          <SpaceOverviewSidePanelContainer spaceId={spaceId} communityCalls={communityCalls} />
        )}
      </React.Suspense>
    );
  }

  return (
    <EntityPageSidebarLayout sidebar={sidebar}>
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

/**
 * A personal space, as a profile (GEO-2859).
 *
 * The main column only. The header above it and the rail beside it are both
 * assembled in the layout, so they persist across every tab rather than
 * appearing and vanishing with this page — see `profileRail` there.
 *
 * The layout's providers already carry this entity: for a profile the space's
 * own `entity` *is* the topic, so `RouteEditorProvider` up there is holding the
 * person's blocks and tabs, and a second set here would be the same data twice.
 */
async function PersonalSpaceBody({
  space,
  topicEntityId,
  tabId,
}: {
  space: NonNullable<Awaited<ReturnType<typeof cachedFetchSpace>>>;
  topicEntityId: string;
  /** An authored tab, when one is open. Its content replaces the profile. */
  tabId: string | undefined;
}) {
  const spaceId = space.id;

  // An authored tab is a page this person wrote, not a view of their profile.
  // Rendering Experience and Education underneath it said the tab was a section
  // of the profile rather than a tab beside it.
  if (tabId) {
    return (
      <React.Suspense fallback={null}>
        <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      </React.Suspense>
    );
  }

  return (
    <>
      <PersonalSpaceProfile spaceId={spaceId} personEntityId={topicEntityId} />

      <Spacer height={40} />

      <React.Suspense fallback={null}>
        <Editor spaceId={spaceId} shouldHandleOwnSpacing />
      </React.Suspense>

      {/*
       * No properties panel. Every property it would list is already on this
       * page in a form a reader understands — the types in the rail, the links
       * beside them, the history in its own sections — and the raw table
       * underneath them says the same things again in the graph's vocabulary
       * rather than a person's.
       */}
      <Spacer height={40} />

      <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
        <React.Suspense fallback={<div />}>
          <BacklinksServerContainer entityId={topicEntityId} />
        </React.Suspense>
      </TrackedErrorBoundary>
    </>
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
