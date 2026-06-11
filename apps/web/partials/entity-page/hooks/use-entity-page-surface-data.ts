'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { fetchCollectionItemsForBlocks } from '~/core/blocks/data/fetch-collection-items';
import type { Tabs } from '~/core/state/editor/editor-provider';
import { useRelationEntityRelations } from '~/core/state/entity-page-store/entity-store';
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
  isLoading: boolean;
  isReady: boolean;
};

export function useEntityPageSurfaceData(
  entityId: string,
  entitySpaceId: string,
  entity: Entity | null,
  isLoadingEntity: boolean
): EntityPageSurfaceData {
  const relationEntityRelations = useRelationEntityRelations(entityId, entitySpaceId);
  const isRelationPage = relationEntityRelations.length > 0;

  const blockRelations = React.useMemo(() => {
    return entity?.relations?.filter(r => r.type.id === SystemIds.BLOCKS) ?? [];
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
      for (const relation of tabEntity.relations ?? []) {
        if (relation.type.id === SystemIds.BLOCKS) {
          ids.add(relation.toEntity.id);
          if (relation.entityId) ids.add(relation.entityId);
        }
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
      const blockRels = (tabEntity.relations ?? []).filter(r => r.type.id === SystemIds.BLOCKS);
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

  const isLoading = (isLoadingEntity && !entity) || isBlocksLoading;
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
    isLoading,
    isReady,
  };
}
