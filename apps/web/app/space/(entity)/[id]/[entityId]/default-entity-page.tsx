import { SystemIds } from '@graphprotocol/grc-20';
import { redirect } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';
import { fetchEntitiesBatch } from '~/core/io/subgraph/fetch-entities-batch';
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
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { EntityPageHeading } from '~/partials/entity-page/entity-page-heading';
import { EntityPageMetadataHeader } from '~/partials/entity-page/entity-page-metadata-header';
import { EntityReferencedByServerContainer } from '~/partials/entity-page/entity-page-referenced-by-server-container';
import { ToggleEntityPage } from '~/partials/entity-page/toggle-entity-page';

import { cachedFetchEntitiesBatch, cachedFetchEntity } from './cached-fetch-entity';

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

  const avatarUrl = Entities.avatar(props.relationsOut) ?? props.serverAvatarUrl;
  const coverUrl = Entities.cover(props.relationsOut) ?? props.serverCoverUrl;

  const tabs = buildTabsForEntityPage(props.tabEntities, params);

  return (
    <EntityStoreProvider
      id={props.id}
      spaceId={props.spaceId}
      initialSpaces={props.spaces}
      initialTriples={props.triples}
      initialRelations={props.relationsOut}
    >
      <EditorProvider
        id={props.id}
        spaceId={props.spaceId}
        initialBlocks={props.blocks}
        initialBlockRelations={props.blockRelations}
        initialTabs={props.tabs}
      >
        {showCover && <EntityPageCover avatarUrl={avatarUrl} coverUrl={coverUrl} />}
        <EntityPageContentContainer>
          <div className="space-y-2">
            {showHeading && (
              <EntityPageHeading spaceId={props.spaceId} entityId={props.id} />
            )}
            {showHeader && (
              <EntityPageMetadataHeader id={props.id} spaceId={props.spaceId} />
            )}
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
          <ErrorBoundary fallback={<EmptyErrorComponent />}>
            {/*
              Some SEO parsers fail to parse meta tags if there's no fallback in a suspense boundary. We don't want to
              show any referenced by loading states but do want to stream it in
            */}
            <React.Suspense fallback={<div />}>
              <EntityReferencedByServerContainer entityId={props.id} name={props.name} spaceId={params.id} />
            </React.Suspense>
          </ErrorBoundary>
        </EntityPageContentContainer>
      </EditorProvider>
    </EntityStoreProvider>
  );
}

const getData = async (spaceId: string, entityId: string, preventRedirect?: boolean) => {
  const entity = await cachedFetchEntity(entityId, spaceId);
  const nameTripleSpace = entity?.nameTripleSpaces?.[0];
  const spaces = entity?.spaces ?? [];

  // Redirect from space configuration page to space page
  if (entity?.types.some(type => type.id === EntityId(SystemIds.SPACE_TYPE)) && nameTripleSpace) {
    console.log(`Redirecting from space configuration entity ${entity.id} to space page ${spaceId}`);
    return redirect(NavUtils.toSpace(spaceId));
  }

  // Redirect from an invalid space to a valid one
  if (entity && !spaces.includes(spaceId) && !preventRedirect) {
    const newSpaceId = Spaces.getValidSpaceIdForEntity(entity);
    console.log(`Redirecting from invalid space ${spaceId} to valid space ${spaceId}`);
    return redirect(NavUtils.toEntity(newSpaceId, entityId));
  }

  const tabIds = entity?.relationsOut
    .filter(r => r.typeOf.id === EntityId(SystemIds.TABS_ATTRIBUTE))
    ?.map(r => r.toEntity.id);

  const tabEntities = tabIds ? await fetchEntitiesBatch({ spaceId, entityIds: tabIds }) : [];

  const tabBlocks = await Promise.all(
    tabEntities.map(async entity => {
      const blockIds = entity?.relationsOut
        .filter(r => r.typeOf.id === EntityId(SystemIds.BLOCKS))
        ?.map(r => r.toEntity.id);

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

  const serverAvatarUrl = Entities.avatar(entity?.relationsOut);
  const serverCoverUrl = Entities.cover(entity?.relationsOut);

  const blockRelations = entity?.relationsOut.filter(r => r.typeOf.id === EntityId(SystemIds.BLOCKS));
  const blockIds = blockRelations?.map(r => r.toEntity.id);
  const blocks = blockIds ? await cachedFetchEntitiesBatch(blockIds) : [];

  return {
    triples: entity?.triples ?? [],
    id: entityId,
    name: entity?.name ?? null,
    description: Entities.description(entity?.triples ?? []),
    spaceId,
    spaces,
    serverAvatarUrl,
    serverCoverUrl,
    relationsOut: entity?.relationsOut ?? [],
    types: entity?.types ?? [],

    tabs,
    tabEntities,

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
