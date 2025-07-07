import { SystemIds } from '@graphprotocol/grc-20';
import { redirect } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { EditorProvider, type Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { Spaces } from '~/core/utils/space';
import { NavUtils } from '~/core/utils/utils';

import { EmptyErrorComponent } from '~/design-system/empty-error-component';
import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { Editor } from '~/partials/editor/editor';
import { AutomaticModeToggle } from '~/partials/entity-page/automatic-mode-toggle';
import { BacklinksServerContainer } from '~/partials/entity-page/backlinks-server-container';
import { EditableHeading } from '~/partials/entity-page/editable-entity-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityPageRelations } from '~/partials/entity-page/entity-page-relations';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

import { cachedFetchEntitiesBatch, cachedFetchEntityPage } from './cached-fetch-entity';

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

  const props = await getData(params.id, params.entityId, searchParams?.edit === 'true' ? true : false);
  const tabs = buildTabsForEntityPage(props.tabEntities, params);

  const showRelations = props.isRelationEntity;

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.spaceId}
      initialSpaces={props.spaces}
      initialValues={props.values}
      initialRelations={props.relations}
    >
      <EditorProvider
        id={props.id}
        spaceId={props.spaceId}
        initialBlocks={props.blocks}
        initialBlockRelations={props.blockRelations}
        initialTabs={props.tabs}
      >
      {showCover && <EntityPageCover avatarUrl={props.serverAvatarUrl} coverUrl={props.serverCoverUrl} />}
      <EntityPageContentContainer>
        <div className="space-y-2">
          {showRelations && <EntityPageRelations relations={props.relationEntityRelations} spaceId={props.spaceId} />}
          {showHeading && <EditableHeading spaceId={props.spaceId} entityId={props.id} />}
          {showHeader && <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} />}
        </div>
        {tabs.length > 1 && (
          <>
            <Spacer height={40} />
            <React.Suspense fallback={null}>
              <TabGroup tabs={tabs} />
            </React.Suspense>
          </>
        )}
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
        <ErrorBoundary fallback={<EmptyErrorComponent />}>
          <React.Suspense fallback={<div />}>
            <BacklinksServerContainer entityId={params.entityId} />
          </React.Suspense>
        </ErrorBoundary>
      </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

const getData = async (spaceId: string, entityId: string, preventRedirect?: boolean) => {
  const entityPage = await cachedFetchEntityPage(entityId, spaceId);

  const entity = entityPage?.entity;
  const relationEntityRelations = entityPage?.relations ?? [];
  const spaces = entity?.spaces ?? [];

  /**
   * Redirect from an invalid space to a valid one. Additionally,
   * redirect to the space front page if the entity is a space.
   *
   * We need to check that spaces has data. We could be navigating
   * to an entity with no data like a relation entity page.
   */
  if (entity && spaces.length > 0 && !spaces.includes(spaceId) && !preventRedirect) {
    const newSpaceId = Spaces.getValidSpaceIdForEntity(entity);
    console.log(`Redirecting from invalid space ${spaceId} to valid space ${newSpaceId}`);

    /**
     * If we're not in a valid space for the entity AND the entity
     * is a space, redirect to the space front page directly.
     */
    if (entity?.types.map(t => t.id).includes(SystemIds.SPACE_TYPE)) {
      console.log(`Redirecting from space entity ${entityId} to space page ${spaceId}`);
      return redirect(NavUtils.toSpace(newSpaceId));
    }

    /**
     * If the entity isn't a space we can redirect to the entity route
     */
    return redirect(NavUtils.toEntity(newSpaceId, entityId));
  }

  /**
   * If we're in a valid space for the entity and the entity is
   * a space, redirect to the space front page directly.
   */
  if (entity?.types.map(t => t.id).includes(SystemIds.SPACE_TYPE)) {
    console.log(`Redirecting from space entity ${entityId} to space page ${spaceId}`);
    return redirect(NavUtils.toSpace(spaceId));
  }

  const tabIds = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY)?.map(r => r.toEntity.id);

  // @TODO: For performance can we wait to fetch tabs until we're on the client?
  const tabEntities = tabIds ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

  // @TODO(migration): We can query blocks from entities now
  const tabBlocks = await Promise.all(
    tabEntities.map(async entity => {
      const blockIds = entity?.relations.filter(r => r.type.id === SystemIds.BLOCKS)?.map(r => r.toEntity.id);

      const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];
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
  const blockIds = blockRelations?.map(r => r.toEntity.id);

  const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

  return {
    values: entity?.values ?? [],
    id: entityId,
    name: entity?.name ?? null,
    description: Entities.description(entity?.values ?? []),
    spaceId,
    spaces,
    serverAvatarUrl,
    serverCoverUrl,
    relations: entity?.relations ?? [],
    types: entity?.types ?? [],

    tabs,
    tabEntities: [],

    // For relation entity pages
    relationEntityRelations,
    isRelationEntity: relationEntityRelations.length > 0,

    // For entity page editor
    blockRelations: blockRelations ?? [],
    blocks,
  };
};

type EntityType = {
  id: string;
  name: string | null;
};

type TabProps = {
  label: string;
  href: string;
};

const buildTabsForEntityPage = (
  tabEntities: EntityType[],
  params: Awaited<Promise<{ id: string; entityId: string }>>
): TabProps[] => {
  const tabs = [];

  const spaceId = params.id;
  const entityId = params.entityId;

  const ALL_ENTITIES_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toEntity(spaceId, entityId)}`,
    },
  ];

  const DYNAMIC_TABS = getDynamicTabs(spaceId, entityId, tabEntities);

  tabs.push(...ALL_ENTITIES_TABS);

  if (DYNAMIC_TABS.length > 0) {
    tabs.push(...DYNAMIC_TABS);
  }

  return tabs;
};

const getDynamicTabs = (spaceId: string, entityId: string, tabEntities: EntityType[]) => {
  const tabs: Array<{ label: string; href: string; priority: 1 | 2 | 3 }> = [];

  tabEntities.forEach(entity => {
    tabs.push({
      label: entity.name ?? '',
      href: `${NavUtils.toEntity(spaceId, entityId)}?tabId=${entity.id}`,
      priority: 1 as const,
    });
  });

  return tabs;
};
