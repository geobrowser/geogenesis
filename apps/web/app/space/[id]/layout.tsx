import {  IdUtils, SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { EntityId } from '~/core/io/schema';
import { EditorProvider, Tabs } from '~/core/state/editor/editor-provider';
import { EntityStoreProvider } from '~/core/state/entity-page-store/entity-store-provider';
import { Entities } from '~/core/utils/entity';
import { NavUtils } from '~/core/utils/utils';
import { getTabSlug } from '~/core/utils/utils';

import { Create } from '~/design-system/icons/create';
import { MenuItem } from '~/design-system/menu';
import { Skeleton } from '~/design-system/skeleton';
import { Spacer } from '~/design-system/spacer';
import { TabGroup } from '~/design-system/tab-group';

import { EditableSpaceHeading } from '~/partials/entity-page/editable-space-header';
import { EntityPageContentContainer } from '~/partials/entity-page/entity-page-content-container';
import { EntityPageCover } from '~/partials/entity-page/entity-page-cover';
import { AddSubspaceDialog } from '~/partials/space-page/add-subspace-dialog';
import { SpaceEditors } from '~/partials/space-page/space-editors';
import { SpaceMembers } from '~/partials/space-page/space-members';
import { SpacePageMetadataHeader } from '~/partials/space-page/space-metadata-header';

import { cachedFetchEntitiesBatch } from '../(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from './cached-fetch-space';

type LayoutProps = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

type EntityType = {
  id: string;
  name: string | null;
};

type TabProps = {
  label: string;
  href: string;
  priority: 1 | 2 | 3;
  hidden?: boolean;
};

export default async function Layout(props0: LayoutProps) {
  const params = await props0.params;

  const { children } = props0;

  const spaceId = params.id;

  const props = await getSpaceFrontPage(spaceId);

  const tabs = buildTabsForSpacePage(props.tabEntities, props.space?.entity?.types ?? [], params);

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
            <TabGroup tabs={tabs} />
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

  const tabIds = entity?.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY)?.map(r => r.toEntity.id);

  const tabEntities = tabIds ? await cachedFetchEntitiesBatch(tabIds, spaceId) : [];

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
    tabs,
    blockRelations: entity.relations,
    blocks,
    space,
    coverUrl: Entities.cover(entity.relations) ?? null,
  };
};

function buildTabsForSpacePage(
  tabEntities: EntityType[],
  types: EntityType[],
  params: Awaited<LayoutProps['params']>
): TabProps[] {
  const typeIds = types.map(t => t.id);
  const tabs = [];

  const spaceId = params.id;

  const ALL_SPACES_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(spaceId)}`,
      priority: 1 as const,
    },
  ];

  const DYNAMIC_TABS = getDynamicTabs(spaceId, tabEntities);

  const SOME_SPACES_TABS = [
    {
      label: 'Governance',
      href: `/space/${spaceId}/governance`,
      priority: 2 as const,
    },
  ];

  const ACTIVITY_TAB = {
    label: 'Activity',
    href: `/space/${spaceId}/activity`,
    priority: 3 as const,
  };

  // Order of how we add the tabs matters. We want to
  // show "content-based" tabs first, then "space-based" tabs.

  // Always show Overview tab for all spaces
  tabs.push(...ALL_SPACES_TABS);

  if (typeIds.includes(SystemIds.SPACE_TYPE)) {
    if (DYNAMIC_TABS.length > 0) {
      tabs.push(...DYNAMIC_TABS);
    }

    if (!typeIds.includes(SystemIds.PERSON_TYPE)) {
      tabs.push(...SOME_SPACES_TABS);
    }
  }

  // Always add Activity tab last
  tabs.push(ACTIVITY_TAB);

  const seen = new Map<string, TabProps>();

  for (const tab of tabs) {
    if (!seen.has(tab.label)) {
      seen.set(tab.label, tab);
    }
  }

  return [...seen.values()].sort((a, b) => a.priority - b.priority);
}

const getDynamicTabs = (spaceId: string, tabEntities: EntityType[]) => {
  const tabs: Array<{ label: string; href: string; priority: 1 | 2 | 3 }> = [];

  tabEntities.forEach(entity => {
    tabs.push({
      label: entity.name ?? '',
      href: `${NavUtils.toSpace(spaceId)}?tabId=${entity.id}`,
      priority: 1 as const,
    });
  });

  tabs.sort((a, b) => {
    const indexA = dynamicTabSequence.indexOf(getTabSlug(a.label));
    const indexB = dynamicTabSequence.indexOf(getTabSlug(b.label));
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return tabs;
};

const dynamicTabSequence = [
  'professional',
  'personal',
  'news',
  'posts',
  'events',
  'places',
  'culture',
  'activities',
  'education',
  'courses',
  'journals',
  'papers',
  'articles',
  'institutions',
  'projects',
  'people',
  'team',
  'jobs',
  'ontology',
  'about',
];
