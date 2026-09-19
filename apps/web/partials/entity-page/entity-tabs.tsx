'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useUserIsEditing } from '~/core/hooks/use-user-is-editing';
import { useQueryEntity, useRelations, useValues } from '~/core/sync/use-store';
import { TabEntity } from '~/core/types';
import { Relation } from '~/core/types';
import { entityHasOnlyPostType } from '~/core/utils/entity/entities';
import { NavUtils, sortRelations } from '~/core/utils/utils';

import { TabGroup } from '~/design-system/tab-group';

import { EditableTabGroup, type SystemTab } from './editable-tab-group';

type EntityTabsProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  /** Product-owned tabs that lead the entity's authored tabs. Defaults to Overview. */
  systemTabsBefore?: SystemTab[];
  /** Authored labels hidden in browse mode because a product-owned tab already uses the name. */
  reservedSystemLabels?: string[];
  /** Visually separates the first authored tab from the product-owned record tabs. */
  divideBeforeAuthored?: boolean;
};

export function EntityTabs({
  entityId,
  spaceId,
  initialTabRelations,
  tabEntities,
  systemTabsBefore,
  reservedSystemLabels = [],
  divideBeforeAuthored = false,
}: EntityTabsProps) {
  // The global toggle is intent, not permission. `useUserIsEditing` intersects it with current
  // space access (and uses the panel's own intent when mounted there), so a toggle carried from a
  // different space cannot expose tab editing to a reader of this one.
  const effectiveEditable = useUserIsEditing(spaceId);
  const { entity } = useQueryEntity({ id: entityId, spaceId });

  const initialTabRelationIds = React.useMemo(() => new Set(initialTabRelations.map(r => r.id)), [initialTabRelations]);

  // Merge local tab relation changes with server data. Tab relations keep their relation `spaceId`;
  // it may differ from the entity URL scope — include merged rows by id so tabs don’t disappear
  // (especially in the side panel).
  const mergedTabRelations = useRelations({
    mergeWith: initialTabRelations,
    selector: r => {
      if (r.fromEntity.id !== entityId || r.type.id !== SystemIds.TABS_PROPERTY) return false;
      if (Boolean(r.isDeleted)) return false;
      if (r.spaceId === spaceId) return true;
      return initialTabRelationIds.has(r.id);
    },
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

  if (entityHasOnlyPostType(entity)) {
    return null;
  }

  const sortedTabEntities = sortedTabRelations.map(r => {
    const base = tabEntityMap.get(r.toEntity.id) ?? { id: r.toEntity.id, name: r.toEntity.name };
    const liveName = liveNameMap.get(r.toEntity.id);
    return liveName !== undefined ? { ...base, name: liveName } : base;
  });

  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const leadingSystemTabs = systemTabsBefore ?? [{ label: 'Overview', href: overviewHref }];

  if (effectiveEditable) {
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
        systemTabsBefore={leadingSystemTabs}
        overviewHref={overviewHref}
      />
    );
  }

  // Build tabs in the correct order
  const reserved = new Set(reservedSystemLabels);
  const tabs = sortedTabEntities
    .filter(entity => !reserved.has(entity.name ?? ''))
    .map(entity => ({
      label: entity.name ?? '',
      href: `${overviewHref}?tabId=${entity.id}`,
    }));

  const allTabs = [
    ...leadingSystemTabs,
    ...tabs.map((tab, index) => ({ ...tab, dividerBefore: divideBeforeAuthored && index === 0 })),
  ];

  if (allTabs.length <= 1) {
    return null;
  }

  return <TabGroup tabs={allTabs} />;
}
