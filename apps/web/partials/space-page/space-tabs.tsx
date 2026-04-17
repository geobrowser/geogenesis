'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { TabEntity } from '~/core/types';
import { Relation } from '~/core/types';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { TabGroup } from '~/design-system/tab-group';

import { EditableTabGroup } from '~/partials/entity-page/editable-tab-group';

type SpaceTabsProps = {
  spaceId: string;
  entityId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  typeIds: string[];
};

export function SpaceTabs({ spaceId, entityId, initialTabRelations, tabEntities, typeIds }: SpaceTabsProps) {
  const { editable } = useEditable();

  // Merge local tab relation changes with server data
  const mergedTabRelations = useRelations({
    mergeWith: initialTabRelations,
    selector: r => r.fromEntity.id === entityId && r.type.id === SystemIds.TABS_PROPERTY && r.spaceId === spaceId,
  });

  // Sort by position to get correct order
  const sortedTabRelations = sortRelations(mergedTabRelations);

  // Map sorted relations to tab entities, maintaining order.
  // For new local tabs (not yet published), fall back to the relation's toEntity data.
  const tabEntityMap = new Map(tabEntities.map(e => [e.id, e]));

  // Subscribe to live name values so inline renames show up without re-fetch.
  const tabEntityIdSet = React.useMemo(() => new Set(sortedTabRelations.map(r => r.toEntity.id)), [sortedTabRelations]);
  const liveNameValues = useValues({
    selector: v =>
      v.property.id === SystemIds.NAME_PROPERTY && v.spaceId === spaceId && tabEntityIdSet.has(v.entity.id),
  });
  const liveNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const v of liveNameValues) map.set(v.entity.id, v.value);
    return map;
  }, [liveNameValues]);

  const sortedTabEntities = sortedTabRelations.map(r => {
    const base = tabEntityMap.get(r.toEntity.id) ?? { id: r.toEntity.id, name: r.toEntity.name };
    const liveName = liveNameMap.get(r.toEntity.id);
    return liveName !== undefined ? { ...base, name: liveName } : base;
  });

  const overviewHref = NavUtils.toSpace(spaceId);

  // Build system tabs that appear after dynamic tabs
  const systemTabsAfter: Array<{ label: string; href: string }> = [];

  if (typeIds.includes(SystemIds.SPACE_TYPE) && !typeIds.includes(SystemIds.PERSON_TYPE)) {
    systemTabsAfter.push({ label: 'Governance', href: `/space/${spaceId}/governance` });
  }

  systemTabsAfter.push({ label: 'Activity', href: `/space/${spaceId}/activity` });

  if (editable && typeIds.includes(SystemIds.SPACE_TYPE)) {
    const editableTabs = sortedTabRelations.map((relation, i) => ({
      relation,
      entityId: sortedTabEntities[i].id,
      name: sortedTabEntities[i].name ?? '',
      href: `${overviewHref}?tabId=${sortedTabEntities[i].id}`,
    }));

    return (
      <EditableTabGroup
        entityId={entityId}
        spaceId={spaceId}
        editableTabs={editableTabs}
        systemTabsBefore={[{ label: 'Overview', href: overviewHref }]}
        systemTabsAfter={systemTabsAfter}
        overviewHref={overviewHref}
      />
    );
  }

  // Build dynamic tabs in the correct order
  const dynamicTabs = sortedTabEntities.map(entity => ({
    label: entity.name ?? '',
    href: `${overviewHref}?tabId=${entity.id}`,
    priority: 1 as const,
  }));

  const tabs = [];

  const ALL_SPACES_TABS = [
    {
      label: 'Overview',
      href: overviewHref,
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
