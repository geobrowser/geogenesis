'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useRelations, useValues } from '~/core/sync/use-store';
import type { Relation, TabEntity } from '~/core/types';
import { sortRelations } from '~/core/utils/utils';

/**
 * The label the entity page gives its own blocks, and the one a custom view takes over.
 *
 * Compared case- and whitespace-insensitively: this is matched against a name an author typed, not
 * against an id.
 */
export const OVERVIEW_TAB_LABEL = 'Overview';

export function isOverviewTabName(name: string | null | undefined): boolean {
  return (name ?? '').trim().toLowerCase() === OVERVIEW_TAB_LABEL.toLowerCase();
}

export type EntityTabsInput = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
};

/**
 * An entity's tabs, in the order the entity defines them, with local edits and renames folded in.
 *
 * Extracted from `EntityTabs` so the custom claim and topic views list the same tabs in the same
 * order as the generic page (GEO-2779). Order comes from the `Tabs` relations' positions, which is
 * where the entity already defines it — re-deriving it anywhere else is how two surfaces start
 * disagreeing about what comes after what.
 *
 * Returns the relations alongside the entities because the editable tab bar needs both, and pairing
 * them by index only holds while one list is built from the other.
 */
export function useEntityTabEntities({ entityId, spaceId, initialTabRelations, tabEntities }: EntityTabsInput): {
  tabRelations: Relation[];
  tabs: TabEntity[];
} {
  const initialTabRelationIds = React.useMemo(() => new Set(initialTabRelations.map(r => r.id)), [initialTabRelations]);

  // Merge local tab relation changes with server data. Tab relations keep their relation `spaceId`;
  // it may differ from the entity URL scope — include merged rows by id so tabs don't disappear
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

  const tabRelations = sortRelations(mergedTabRelations);

  // Subscribe to live name values so inline renames show up without re-fetch.
  const tabEntityIdSet = React.useMemo(() => new Set(tabRelations.map(r => r.toEntity.id)), [tabRelations]);
  const liveNameValues = useValues({
    selector: v =>
      v.property.id === SystemIds.NAME_PROPERTY && v.spaceId === spaceId && tabEntityIdSet.has(v.entity.id),
  });
  const liveNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const v of liveNameValues) map.set(v.entity.id, v.value);
    return map;
  }, [liveNameValues]);

  const tabEntityMap = React.useMemo(() => new Map(tabEntities.map(e => [e.id, e])), [tabEntities]);

  const tabs = tabRelations.map(r => {
    // A tab added locally has no fetched entity yet, so the relation's own target carries the name.
    const base = tabEntityMap.get(r.toEntity.id) ?? { id: r.toEntity.id, name: r.toEntity.name };
    const liveName = liveNameMap.get(r.toEntity.id);
    return liveName !== undefined ? { ...base, name: liveName } : base;
  });

  return { tabRelations, tabs };
}
