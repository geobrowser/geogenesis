'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useFeatureFlag } from '~/core/state/feature-flags';
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

type BuiltSpaceTab = {
  label: string;
  href: string;
  priority: 1 | 2 | 3 | 4 | 5;
};

type BuildSpaceTabsParams = {
  spaceId: string;
  overviewHref: string;
  dynamicTabs: Array<{ label: string; href: string }>;
  typeIds: string[];
  questionsTabEnabled: boolean;
};

export function buildSpaceTabs({
  spaceId,
  overviewHref,
  dynamicTabs,
  typeIds,
  questionsTabEnabled,
}: BuildSpaceTabsParams): BuiltSpaceTab[] {
  const tabs: BuiltSpaceTab[] = [];

  const ALL_SPACES_TABS: BuiltSpaceTab[] = [
    {
      label: 'Overview',
      href: overviewHref,
      priority: 1,
    },
  ];

  const QUESTION_TAB: BuiltSpaceTab = {
    label: 'Claims',
    href: `/space/${spaceId}/claims`,
    priority: 2,
  };

  const DEBATE_TAB: BuiltSpaceTab = {
    label: 'Debates',
    href: `/space/${spaceId}/debates`,
    priority: 3,
  };

  const SOME_SPACES_TABS: BuiltSpaceTab[] = [
    {
      label: 'Governance',
      href: `/space/${spaceId}/governance`,
      priority: 4,
    },
  ];

  const ACTIVITY_TAB: BuiltSpaceTab = {
    label: 'Activity',
    href: `/space/${spaceId}/activity`,
    priority: 5,
  };

  tabs.push(...ALL_SPACES_TABS);

  if (typeIds.includes(SystemIds.SPACE_TYPE)) {
    if (dynamicTabs.length > 0) {
      const reservedLabels = new Set(questionsTabEnabled ? [QUESTION_TAB.label, DEBATE_TAB.label] : []);
      const visibleDynamicTabs =
        reservedLabels.size > 0 ? dynamicTabs.filter(tab => !reservedLabels.has(tab.label)) : dynamicTabs;

      tabs.push(...visibleDynamicTabs.map(tab => ({ ...tab, priority: 1 as const })));
    }
  }

  if (questionsTabEnabled) {
    tabs.push(QUESTION_TAB);
    tabs.push(DEBATE_TAB);
  }

  if (typeIds.includes(SystemIds.SPACE_TYPE) && !typeIds.includes(SystemIds.PERSON_TYPE)) {
    tabs.push(...SOME_SPACES_TABS);
  }

  tabs.push(ACTIVITY_TAB);

  const seen = new Map<string, BuiltSpaceTab>();

  for (const tab of tabs) {
    if (!seen.has(tab.label)) {
      seen.set(tab.label, tab);
    }
  }

  return [...seen.values()].sort((a, b) => a.priority - b.priority);
}

export function SpaceTabs({ spaceId, entityId, initialTabRelations, tabEntities, typeIds }: SpaceTabsProps) {
  const { editable } = useEditable();
  const questionsTabEnabled = useFeatureFlag('questionsTab');

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

  if (questionsTabEnabled) {
    systemTabsAfter.push({ label: 'Claims', href: `/space/${spaceId}/claims` });
    systemTabsAfter.push({ label: 'Debates', href: `/space/${spaceId}/debates` });
  }

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
  }));

  const tabs = buildSpaceTabs({ spaceId, overviewHref, dynamicTabs, typeIds, questionsTabEnabled });

  return <TabGroup tabs={tabs} />;
}
