'use client';

import { SystemIds } from '@graphprotocol/grc-20';

import * as React from 'react';

import { useRelations } from '~/core/sync/use-store';
import { TabEntity } from '~/core/types';
import { NavUtils, sortRelations } from '~/core/utils/utils';
import { Relation } from '~/core/v2.types';

import { TabGroup } from '~/design-system/tab-group';

type SpaceTabsProps = {
  spaceId: string;
  entityId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  typeIds: string[];
};

export function SpaceTabs({ spaceId, entityId, initialTabRelations, tabEntities, typeIds }: SpaceTabsProps) {
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

  // Build dynamic tabs in the correct order
  const dynamicTabs = sortedTabEntities.map(entity => ({
    label: entity.name ?? '',
    href: `${NavUtils.toSpace(spaceId)}?tabId=${entity.id}`,
    priority: 1 as const,
  }));

  const tabs = [];

  const ALL_SPACES_TABS = [
    {
      label: 'Overview',
      href: `${NavUtils.toSpace(spaceId)}`,
      priority: 1 as const,
    },
  ];

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

  tabs.push(...ALL_SPACES_TABS);

  if (typeIds.includes(SystemIds.SPACE_TYPE)) {
    if (dynamicTabs.length > 0) {
      tabs.push(...dynamicTabs);
    }

    if (!typeIds.includes(SystemIds.PERSON_TYPE)) {
      tabs.push(...SOME_SPACES_TABS);
    }
  }

  tabs.push(ACTIVITY_TAB);

  const seen = new Map<string, (typeof tabs)[0]>();

  for (const tab of tabs) {
    if (!seen.has(tab.label)) {
      seen.set(tab.label, tab);
    }
  }

  return <TabGroup tabs={[...seen.values()].sort((a, b) => a.priority - b.priority)} />;
}
