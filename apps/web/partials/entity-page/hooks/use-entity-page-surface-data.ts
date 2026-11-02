'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import type { Tabs } from '~/core/state/editor/editor-provider';
import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import { useQueryEntities, useQueryEntitiesAsync } from '~/core/sync/use-store';
import type { Entity, Relation, TabEntity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { sortRelations } from '~/core/utils/utils';

export type EntityPageSurfaceData = {
  avatarUrl: string | null;
  coverUrl: string | null;
  blockRelations: Relation[];
  blocks: Entity[];
  initialTabs: Tabs;
  initialCollectionItems: Record<string, Entity[]>;
  tabRelations: Relation[];
  tabEntities: TabEntity[];
  isRelationPage: boolean;
  isLoadingBlocks: boolean;
  isLoading: boolean;
  isReady: boolean;
};

function getBlockRelations(entity: Entity | null | undefined): Relation[] {
  return entity?.relations.filter(relation => relation.type.id === SystemIds.BLOCKS) ?? [];
}

export function useEntityPageSurfaceData(
  entityId: string,
  entitySpaceId: string,
  entity: Entity | null,
  isLoadingEntity: boolean
): EntityPageSurfaceData {
  const isEditing = useUserIsEditing(entitySpaceId);
  const activeTabId = useEntitySidePanelActiveTab()?.activeTabId;
  const relationEntityRelations = useRelationEntityRelations(entityId, entitySpaceId);
  const isRelationPage = relationEntityRelations.length > 0;

  const blockRelations = React.useMemo(() => {
    return getBlockRelations(entity);
  }, [entity]);

  const blockIds = React.useMemo(() => blockRelations.map(r => r.toEntity.id), [blockRelations]);

  const { entities: blocks, isLoading: isBlocksLoading } = useQueryEntities({
    where: { id: { in: blockIds } },
    enabled: blockIds.length > 0,
    first: Math.max(blockIds.length, 9),
  });

  const tabRelations = React.useMemo(() => {
    if (!entity?.relations) return [];
    return sortRelations(entity.relations.filter(r => r.type.id === SystemIds.TABS_PROPERTY));
  }, [entity]);

  const tabIds = React.useMemo(() => tabRelations.map(r => r.toEntity.id), [tabRelations]);

  const { entities: syncedTabEntities, isLoading: loadingTabEntities } = useQueryEntities({
    where: { id: { in: tabIds } },
    enabled: Boolean(entity && tabIds.length > 0),
    first: Math.max(tabIds.length, 9),
  });

  const tabEntitiesOrdered = React.useMemo(() => {
    if (tabIds.length === 0) return [];
    const list = syncedTabEntities ?? [];
    const map = new Map(list.map(e => [e.id, e]));
    return tabIds.map(id => map.get(id)).filter((e): e is Entity => e != null);
  }, [syncedTabEntities, tabIds]);

  const nestedTabBlockIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const tabEntity of tabEntitiesOrdered) {
      for (const relation of getBlockRelations(tabEntity)) {
        ids.add(relation.toEntity.id);
        if (relation.entityId) ids.add(relation.entityId);
      }
    }
    return [...ids];
  }, [tabEntitiesOrdered]);

  const { entities: nestedTabBlockEntities, isLoading: loadingNestedTabBlocks } = useQueryEntities({
    where: { id: { in: nestedTabBlockIds } },
    enabled: nestedTabBlockIds.length > 0,
    first: Math.max(nestedTabBlockIds.length, 9),
  });

  const initialTabs = React.useMemo((): Tabs => {
    const blockMap = new Map((nestedTabBlockEntities ?? []).map(e => [e.id, e]));
    const tabs: Tabs = {};
    for (const tabEntity of tabEntitiesOrdered) {
      const blockRels = getBlockRelations(tabEntity);
      const orderedIds = [...new Set(blockRels.map(r => r.toEntity.id))];
      tabs[tabEntity.id] = {
        entity: tabEntity,
        blocks: orderedIds.map(id => blockMap.get(id)).filter((e): e is Entity => e != null),
      };
    }
    return tabs;
  }, [tabEntitiesOrdered, nestedTabBlockEntities]);

  const tabEntities = React.useMemo(
    (): TabEntity[] => tabEntitiesOrdered.map(e => ({ id: e.id, name: e.name ?? null })),
    [tabEntitiesOrdered]
  );

  const findMany = useQueryEntitiesAsync();
  const [initialCollectionItems, setInitialCollectionItems] = React.useState<Record<string, Entity[]>>({});

  React.useEffect(() => {
    if (!entity) {
      setInitialCollectionItems({});
      return;
    }
    if (loadingTabEntities || loadingNestedTabBlocks) return;

    const overviewBlocks = blocks ?? [];
    const tabBlocksFlat = Object.values(initialTabs).flatMap(tab => tab.blocks);
    const mergedBlocks = [...overviewBlocks, ...tabBlocksFlat];
    if (mergedBlocks.length === 0) {
      setInitialCollectionItems({});
      return;
    }

    let cancelled = false;
    fetchCollectionItemsForBlocks(
      mergedBlocks,
      async ids => {
        if (ids.length === 0) return [];
        return findMany({ where: { id: { in: ids } }, first: Math.max(ids.length, 9) });
      },
      entitySpaceId
    ).then(items => {
      if (!cancelled) setInitialCollectionItems(items);
    });

    return () => {
      cancelled = true;
    };
  }, [entity, blocks, initialTabs, loadingTabEntities, loadingNestedTabBlocks, entitySpaceId, findMany]);

  // Match the panel's editor scope: an authored tab must wait for its own blocks, while an
  // unrelated overview/tab request must not hold up content that is already available.
  const activeTab = activeTabId ? initialTabs[activeTabId] : undefined;
  const activeBlockIds = activeTabId ? getBlockRelations(activeTab?.entity).map(r => r.toEntity.id) : blockIds;
  const activeBlocks = activeTabId ? activeTab?.blocks : blocks;
  const activeBlocksLoading = activeTabId ? loadingTabEntities || loadingNestedTabBlocks : isBlocksLoading;
  const waitingForTab = Boolean(activeTabId && !activeTab && loadingTabEntities);
  const availableBlockIds = new Set((activeBlocks ?? []).map(block => block.id));
  // Editing still waits for the initial read, so cached metadata cannot seed an incomplete document.
  const isLoadingBlocks =
    waitingForTab || (activeBlocksLoading && (isEditing || activeBlockIds.some(id => !availableBlockIds.has(id))));
  // Identity, custom browse views and comments do not depend on the overview's authored blocks.
  const isLoading = isLoadingEntity && !entity;
  const isReady = Boolean(entity) && !isLoading;

  const avatarUrl = entity ? Entities.avatar(entity.relations) : null;
  const coverUrl = entity ? Entities.cover(entity.relations) : null;

  return {
    avatarUrl,
    coverUrl,
    blockRelations,
    blocks: blocks ?? [],
    initialTabs,
    initialCollectionItems,
    tabRelations,
    tabEntities,
    isRelationPage,
    isLoadingBlocks,
    isLoading,
    isReady,
  };
}
