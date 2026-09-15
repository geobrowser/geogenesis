'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { useEditable } from '~/core/state/editable-store';
import { useDebugDebatesPageEnabled } from '~/core/state/feature-flags';
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
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Draws a rule before this tab, separating the space's own tabs from authored ones. */
  dividerBefore?: boolean;
  /** Only shown at the widths where the side rail is dropped. */
  onlyWhenNarrow?: boolean;
};

type BuildSpaceTabsParams = {
  spaceId: string;
  overviewHref: string;
  dynamicTabs: Array<{ label: string; href: string }>;
  typeIds: string[];
  isDebugDebatesPageEnabled: boolean;
};

export function buildSpaceTabs({
  spaceId,
  overviewHref,
  dynamicTabs,
  typeIds,
  isDebugDebatesPageEnabled,
}: BuildSpaceTabsParams): BuiltSpaceTab[] {
  const tabs: BuiltSpaceTab[] = [];

  const ALL_SPACES_TABS: BuiltSpaceTab[] = [
    {
      label: 'Overview',
      href: overviewHref,
      priority: 1,
    },
  ];

  const DEBUG_DEBATES_TAB: BuiltSpaceTab = {
    label: 'Debug debates',
    href: `/space/${spaceId}/debug-debates`,
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

  /**
   * A person's record (GEO-2859).
   *
   * These are the person's, not the space's: debates they took a side in,
   * claims they hold a position on, proposals they made anywhere. They stand in
   * for both Governance and Activity, which is why a person gets neither — a
   * personal space has no governance of its own, and Proposals is the same log
   * Activity was showing, with the vote and the outcome on it.
   */
  const isPerson = typeIds.includes(SystemIds.PERSON_TYPE);

  const PERSON_TABS: BuiltSpaceTab[] = [
    { label: 'Debates', href: `/space/${spaceId}/debates`, priority: 4 },
    { label: 'Positions', href: `/space/${spaceId}/positions`, priority: 4 },
    { label: 'Proposals', href: `/space/${spaceId}/proposals`, priority: 4 },
  ];

  tabs.push(...ALL_SPACES_TABS);

  if (typeIds.includes(SystemIds.SPACE_TYPE)) {
    if (dynamicTabs.length > 0) {
      const reservedLabels = new Set([...(isDebugDebatesPageEnabled ? [DEBUG_DEBATES_TAB.label] : [])]);
      const visibleDynamicTabs =
        reservedLabels.size > 0 ? dynamicTabs.filter(tab => !reservedLabels.has(tab.label)) : dynamicTabs;

      // A person's authored tabs go last, behind a rule: the three system tabs
      // are the record everyone's profile has, and what this person chose to
      // add is a different kind of thing. A space keeps them beside Overview,
      // where its own content has always led.
      tabs.push(
        ...visibleDynamicTabs.map((tab, index) => ({
          ...tab,
          priority: (isPerson ? 6 : 1) as 1 | 6,
          dividerBefore: isPerson && index === 0,
        }))
      );
    }
  }

  if (isDebugDebatesPageEnabled) tabs.push(DEBUG_DEBATES_TAB);

  if (typeIds.includes(SystemIds.SPACE_TYPE) && !isPerson) {
    tabs.push(...SOME_SPACES_TABS);
  }

  // Pushed after the dynamic tabs, so a person who authored their own "Debates"
  // keeps it — the dedupe below is first-wins, the same way an authored Claims
  // tab already beats the system one.
  if (isPerson) {
    tabs.push(...PERSON_TABS);

    // Last, and only where the rail is not. Below 1024px `StickySideRail` drops
    // itself rather than render something too narrow to read, and without this
    // the spaces, links and counts are simply unreachable on a phone.
    tabs.push({ label: 'About', href: `/space/${spaceId}/about`, priority: 7, onlyWhenNarrow: true });
  }

  if (!isPerson) tabs.push(ACTIVITY_TAB);

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
  const isDebugDebatesPageEnabled = useDebugDebatesPageEnabled();

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

  // Our Community tab renders for non-person spaces, always as the 2nd tab (after
  // Overview) — and in addition to any custom "Community" tab the space authored.
  const isPersonSpace = typeIds.includes(SystemIds.PERSON_TYPE);
  const showCommunity = typeIds.includes(SystemIds.SPACE_TYPE) && !isPersonSpace;
  // System tabs bracket the custom (dynamic) tabs: Overview + our Community lead,
  // Governance + Activity trail.
  const systemTabsBefore: Array<{ label: string; href: string }> = [{ label: 'Overview', href: overviewHref }];
  if (showCommunity) systemTabsBefore.push({ label: 'Community', href: `/space/${spaceId}/community` });

  const systemTabsAfter: Array<{ label: string; href: string }> = [];

  if (isDebugDebatesPageEnabled) {
    systemTabsAfter.push({ label: 'Debug debates', href: `/space/${spaceId}/debug-debates` });
  }

  if (showCommunity) systemTabsAfter.push({ label: 'Governance', href: `/space/${spaceId}/governance` });

  // The same three the read-only path builds, so a person's record does not
  // disappear the moment they switch their own profile into edit mode — and
  // *before* the authored tabs, which is where they sit on a profile.
  if (isPersonSpace) {
    systemTabsBefore.push(
      { label: 'Debates', href: `/space/${spaceId}/debates` },
      { label: 'Positions', href: `/space/${spaceId}/positions` },
      { label: 'Proposals', href: `/space/${spaceId}/proposals` }
    );
    systemTabsAfter.push({ label: 'About', href: `/space/${spaceId}/about` });
  } else {
    systemTabsAfter.push({ label: 'Activity', href: `/space/${spaceId}/activity` });
  }

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
        systemTabsBefore={systemTabsBefore}
        systemTabsAfter={systemTabsAfter}
        overviewHref={overviewHref}
      />
    );
  }

  // Custom (content) tabs, in their authored order.
  const dynamicTabs = sortedTabEntities.map(entity => ({
    label: entity.name ?? '',
    href: `${overviewHref}?tabId=${entity.id}`,
  }));

  const baseTabs = buildSpaceTabs({
    spaceId,
    overviewHref,
    dynamicTabs,
    typeIds,
    isDebugDebatesPageEnabled,
  });

  // Overview, then our Community tab, then everything else.
  const tabs = showCommunity
    ? [
        baseTabs[0],
        { label: 'Community', href: `/space/${spaceId}/community`, priority: 1 as const },
        ...baseTabs.slice(1),
      ]
    : baseTabs;

  return <TabGroup tabs={tabs} />;
}
