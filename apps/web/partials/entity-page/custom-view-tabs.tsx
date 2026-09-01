'use client';

import * as React from 'react';

import { useActiveTabIdForEditor } from '~/core/state/editor/editor-provider';
import type { Relation, TabEntity } from '~/core/types';
import { NavUtils } from '~/core/utils/utils';

import { TabGroup } from '~/design-system/tab-group';

import { Editor } from '~/partials/editor/editor';

import { OVERVIEW_TAB_LABEL, isOverviewTabName, useEntityTabEntities } from './use-entity-tab-entities';

type CustomViewTabsProps = {
  entityId: string;
  spaceId: string;
  initialTabRelations: Relation[];
  tabEntities: TabEntity[];
  /** The custom view. It is what the Overview tab shows. */
  children: React.ReactNode;
};

/**
 * The column the custom claim and topic views lay themselves out in.
 *
 * Repeated here rather than imported from either of them: the tab bar and a tab's blocks have to
 * line up with whichever view is underneath, and both use these measurements. Kept in one constant
 * so the three cannot drift apart.
 */
const COLUMN_CLASS_NAME = 'mx-auto w-full max-w-[720px] px-4 @[560px]:px-5';

/**
 * A custom view, with the underlying entity's other tabs beside it (GEO-2779).
 *
 * The claim and topic views replace the generic entity page rather than sitting inside it, so they
 * never reached the tab bar and an entity's other tabs were simply unreachable from them. Here the
 * custom view *is* the Overview tab — the first tab and the one the page lands on — and the
 * entity's own tabs follow, in the order the entity defines them.
 *
 * Two rules from the ticket fall out of that framing rather than needing to be enforced separately:
 *
 * - **No bar for a lone tab.** With nothing to switch to, a single "Overview" tab is chrome that
 *   does nothing, so the custom view renders alone — matching what the generic page already does.
 * - **One Overview.** An entity that names one of its own tabs "Overview" does not get a second
 *   one; the custom view has taken that place. Its blocks are unreachable from this surface, which
 *   is the trade the ticket chose. A `?tabId=` pointing at it lands on the custom view, because a
 *   suppressed tab is not in the list this matches against.
 */
export function CustomViewTabs({ entityId, spaceId, initialTabRelations, tabEntities, children }: CustomViewTabsProps) {
  const { tabs } = useEntityTabEntities({ entityId, spaceId, initialTabRelations, tabEntities });
  const activeTabId = useActiveTabIdForEditor();

  const additionalTabs = React.useMemo(() => tabs.filter(tab => !isOverviewTabName(tab.name)), [tabs]);

  if (additionalTabs.length === 0) {
    return <>{children}</>;
  }

  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const isAdditionalTabActive = additionalTabs.some(tab => tab.id === activeTabId);

  return (
    <div className="@container">
      <div className={`${COLUMN_CLASS_NAME} pt-6 @[560px]:pt-8`}>
        <TabGroup
          tabs={[
            { label: OVERVIEW_TAB_LABEL, href: overviewHref },
            ...additionalTabs.map(tab => ({
              label: tab.name ?? '',
              href: `${overviewHref}?tabId=${tab.id}`,
            })),
          ]}
        />
      </div>
      {isAdditionalTabActive ? (
        // The editor is already scoped to `?tabId=` by `EditorBlocksProvider`, so this renders the
        // selected tab's blocks without being told which tab is open.
        <div className={`${COLUMN_CLASS_NAME} pt-6 pb-8 @[560px]:pt-8`}>
          <Editor spaceId={spaceId} shouldHandleOwnSpacing />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
