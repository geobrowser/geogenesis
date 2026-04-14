'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useRelations, useValues } from '~/core/sync/use-store';
import { TabEntity } from '~/core/types';
import { Relation } from '~/core/types';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { TabGroup } from '~/design-system/tab-group';

import { EditableTabGroup } from './editable-tab-group';

type EntityTabsProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
};

export function EntityTabs({ entityId, spaceId, initialTabRelations, tabEntities }: EntityTabsProps) {
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

  const overviewHref = NavUtils.toEntity(spaceId, entityId);

  if (editable) {
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
        overviewHref={overviewHref}
      />
    );
  }

  // Build tabs in the correct order
  const tabs = sortedTabEntities.map(entity => ({
    label: entity.name ?? '',
    href: `${overviewHref}?tabId=${entity.id}`,
  }));

  // Add Overview tab at the beginning
  const allTabs = [
    {
      label: 'Overview',
      href: overviewHref,
    },
    ...tabs,
  ];

  if (allTabs.length <= 1) {
    return null;
  }

  return <TabGroup tabs={allTabs} />;
}
