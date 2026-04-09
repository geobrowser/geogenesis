import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { redirect } from 'next/navigation';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { EditorProvider, type Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { TrackedErrorBoundary } from '~/core/telemetry/tracked-error-boundary';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';

import { CommentSection } from '~/partials/comments/comments-section';
import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityTabs } from '~/partials/entity-page/entity-tabs';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

import { cachedFetchEntitiesBatch, cachedFetchEntityPage } from './cached-fetch-entity';
import { EntityPageHeader } from './entity-page-header';
import { SpaceRedirect } from './space-redirect';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

interface Props {
  params: { id: string; entityId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
  showCover?: boolean;
  showHeading?: boolean;
  showHeader?: boolean;
  notice?: React.ReactNode;
}

export default async function DefaultEntityPage({
  params,
  searchParams = {},
  showCover = true,
  showHeading = true,
  showHeader = true,
  notice = null,
}: Props) {
  const showSpacer = showCover || showHeading || showHeader;

  const isEditing = searchParams?.edit === 'true';
  const props = await getData(params.id, params.entityId);

  return (
    <SpaceRedirect
      entityId={props.id}
      spaceId={props.spaceId}
      serverSpaces={props.serverSpaces}
      deterministicSpaceId={props.deterministicSpaceId}
      preventRedirect={isEditing}
    >
      <EntityStoreProvider id={props.id} spaceId={props.spaceId}>
        <EditorProvider
          id={props.id}
          spaceId={props.spaceId}
          initialBlocks={props.blocks}
          initialBlockRelations={props.blockRelations}
          initialTabs={props.tabs}
          initialCollectionItems={props.initialCollectionItems}
        >
          {showCover && <EntityPageCover avatarUrl={props.serverAvatarUrl} coverUrl={props.serverCoverUrl} />}
          <EntityPageContentContainer>
            <EntityPageHeader
              showHeading={showHeading}
              showHeader={showHeader}
              entityId={props.id}
              spaceId={props.spaceId}
              serverRelations={props.relationEntityRelations}
            />
            <Spacer height={40} />
            <React.Suspense fallback={null}>
              <EntityTabs
                entityId={props.id}
                spaceId={props.spaceId}
                initialTabRelations={props.tabRelations ?? []}
                tabEntities={props.tabEntities}
              />
            </React.Suspense>
            {notice}
            {(showSpacer || !!notice) && <Spacer height={40} />}

            <Editor spaceId={props.spaceId} shouldHandleOwnSpacing />
            <ToggleEntityPage {...props} />
            <AutomaticModeToggle />
            <Spacer height={40} />
            {/*
               Some SEO parsers fail to parse meta tags if there's no fallback in a suspense
               boundary. We don't want to show any referenced by loading states but do want to
               stream it in
            */}
            <TrackedErrorBoundary fallback={<EmptyErrorComponent />}>
              <React.Suspense fallback={<div />}>
                <BacklinksServerContainer entityId={params.entityId} />
              </React.Suspense>
            </TrackedErrorBoundary>
            <CommentSection entityId={params.entityId} spaceId={props.spaceId} />
          </EntityPageContentContainer>
        </EditorProvider>
      </EntityStoreProvider>
    </SpaceRedirect>
  );
}

const getData = async (spaceId: string, entityId: string) => {
  const entityPage = await cachedFetchEntityPage(entityId, spaceId);

  const entity = entityPage?.entity;
  const relationEntityRelations = entityPage?.relations ?? [];
  const spaces = entity?.spaces ?? [];
  const deterministicSpaceId = Spaces.getDeterministicSpaceId(spaces, spaceId);

  /**
   * Only redirect to the space front page if this entity is the page
   * entity for the current space, not a SPACE_TYPE from another space.
   */
  if (entity?.types.map(t => t.id).includes(SystemIds.SPACE_TYPE) && deterministicSpaceId) {
    const space = await cachedFetchSpace(deterministicSpaceId);
    if (space?.entity?.id === entityId && !Spaces.hasExternalTopic(space)) {
      return redirect(NavUtils.toSpace(deterministicSpaceId));
    }
  }

  const tabRelations = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY) ?? [];
  const tabIds = sortRelations(tabRelations).map(r => r.toEntity.id);

  // @TODO: For performance can we wait to fetch tabs until we're on the client?
  const fetchedTabEntities = tabIds ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // Re-order entities to match the sorted tabIds order (batch fetch doesn't preserve order)
  const tabEntityMap = new Map(fetchedTabEntities.map(e => [e.id, e]));
  const tabEntities = tabIds.map(id => tabEntityMap.get(id)).filter((e): e is NonNullable<typeof e> => e != null);

  // @TODO(migration): We can query blocks from entities now
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
    tabs[entity.id] = {
      entity,
      blocks: tabBlocks[index],
    };
  });

  const serverAvatarUrl = Entities.avatar(entity?.relations);
  const serverCoverUrl = Entities.cover(entity?.relations);

  const blockRelations = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS);
  const blockEntityIds = blockRelations?.map(r => r.toEntity.id) ?? [];
  const blockRelationEntityIds = blockRelations?.map(r => r.entityId).filter(Boolean) ?? [];
  const allBlockIds = [...new Set([...blockEntityIds, ...blockRelationEntityIds])];

  const blocks = allBlockIds.length > 0 ? await cachedFetchEntitiesBatch(allBlockIds) : [];

  const allBlocks = [...blocks, ...tabBlocks.flat()];
  const initialCollectionItems = await fetchCollectionItemsForBlocks(allBlocks, cachedFetchEntitiesBatch, spaceId);

  return {
    id: entityId,
    spaceId,
    serverAvatarUrl,
    serverCoverUrl,
    serverSpaces: spaces,
    deterministicSpaceId: deterministicSpaceId ?? null,

    tabs,
    tabEntities,
    tabRelations,

    // For relation entity pages
    relationEntityRelations,

    // For entity page editor
    blockRelations: blockRelations ?? [],
    blocks,
    initialCollectionItems,
  };
};
