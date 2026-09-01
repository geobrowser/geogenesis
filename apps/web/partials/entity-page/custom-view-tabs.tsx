'use client';

import * as React from 'react';

import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import type { Relation, TabEntity } from '~/core/types';

import { TabGroup } from '~/design-system/tab-group';

import { Editor } from '~/partials/editor/editor';

import { entityTabLinks, isOverviewTabName, useEntityTabEntities } from './use-entity-tab-entities';

/**
 * The tab bar and the switched region, handed to a custom view to place itself.
 *
 * The view decides the seam, because only it knows which of its sections describe the entity and
 * which are its Overview content: on a claim the split falls after My position, on a topic after
 * the distribution strip. Everything the view renders above `bar` stays put whichever tab is open.
 */
export type CustomViewTabsSlot = {
  /** The tab bar. `null` when the entity has no other tabs and there is nothing to switch to. */
  bar: React.ReactNode;
  /** The selected tab's blocks, or `null` while Overview is showing and the view renders its own. */
  body: React.ReactNode | null;
};

export type CustomViewTabsInput = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
};

/**
 * An entity's other tabs, for a custom claim or topic view (GEO-2779).
 *
 * These views replace the generic entity page rather than sitting inside it, so they never reached
 * the tab bar and an entity's other tabs were unreachable from them. Here the custom view *is* the
 * Overview tab — the first tab and the one the page lands on — and the entity's own tabs follow, in
 * the order the entity defines them.
 *
 * Two rules from the ticket fall out of that framing rather than needing to be enforced separately:
 *
 * - **No bar for a lone tab.** With nothing to switch to, a single "Overview" is chrome that does
 *   nothing, so the view renders alone — matching what the generic page already decides.
 * - **One Overview.** An entity that names one of its own tabs "Overview" does not get a second
 *   one; the custom view has taken that place. A `?tabId=` pointing at it lands on the custom view,
 *   because a suppressed tab is not in the list the active tab is matched against.
 *
 * A hook rather than a wrapper: the bar belongs partway down the view, under the sections that say
 * what the entity is, and a component wrapped around the view could only put it above everything.
 */
export function useCustomViewTabs({
  entityId,
  spaceId,
  initialTabRelations,
  tabEntities,
}: CustomViewTabsInput): CustomViewTabsSlot {
  const { tabs } = useEntityTabEntities({ entityId, spaceId, initialTabRelations, tabEntities });
  const activeTabId = useActiveTabIdForEditor();

  const additionalTabs = React.useMemo(() => tabs.filter(tab => !isOverviewTabName(tab.name)), [tabs]);

  return React.useMemo(() => {
    if (additionalTabs.length === 0) return { bar: null, body: null };

    const [overview, ...rest] = entityTabLinks({ spaceId, entityId, tabs: additionalTabs });
    const isAdditionalTabActive = additionalTabs.some(tab => tab.id === activeTabId);

    return {
      bar: (
        <TabGroup
          tabs={[
            // Said outright rather than left to the href comparison, which assumes the active tab
            // is in this list. It is not when `?tabId=` names the entity's own suppressed
            // "Overview" — reachable from a shared link, or from leaving edit mode while that tab
            // is open — and the view answers for that tab, so Overview is what is selected.
            { ...overview, active: !isAdditionalTabActive },
            ...rest,
          ]}
        />
      ),
      // The editor is already scoped to the active tab by `EditorBlocksProvider`, so this renders
      // the selected tab's blocks without being told which one is open.
      body: isAdditionalTabActive ? <Editor spaceId={spaceId} shouldHandleOwnSpacing /> : null,
    };
  }, [additionalTabs, activeTabId, entityId, spaceId]);
}
