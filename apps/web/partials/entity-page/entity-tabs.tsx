'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useRelations } from '~/core/sync/use-store';
import { NavUtils, sortRelations } from '~/core/utils/utils';
import { Entity, Relation } from '~/core/v2.types';

import { TabGroup } from '~/design-system/tab-group';

type TabEntity = {
  id: string;
  name: string | null;
};

type EntityTabsProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
};

export function EntityTabs({ entityId, spaceId, initialTabRelations, tabEntities }: EntityTabsProps) {
  // Merge local tab relation changes with server data
  const mergedTabRelations = useRelations({
    mergeWith: initialTabRelations,
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.TABS_PROPERTY && r.spaceId === spaceId,
  });

  // Sort by position to get correct order
  const sortedTabRelations = sortRelations(mergedTabRelations);

  // Map sorted relations to tab entities, maintaining order
  const tabEntityMap = new Map(tabEntities.map(e => [e.id, e]));
  const sortedTabEntities = sortedTabRelations
    .map(r => tabEntityMap.get(r.toEntity.id))
    .filter((e): e is TabEntity => e != null);

  // Build tabs in the correct order
  const tabs = sortedTabEntities.map(entity => ({
    label: entity.name ?? '',
    href: `${NavUtils.toEntity(spaceId, entityId)}?tabId=${entity.id}`,
  }));

  // Add Overview tab at the beginning
  const allTabs = [
    {
      label: 'Overview',
      href: `${NavUtils.toEntity(spaceId, entityId)}`,
    },
    ...tabs,
  ];

  if (allTabs.length <= 1) {
    return null;
  }

  return <TabGroup tabs={allTabs} />;
}
