'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useSearchParams } from 'next/navigation';

import { useEntitySidePanelActiveTab } from '~/core/state/entity-side-panel-active-tab';
import type { TabEntity } from '~/core/types';
import { NavUtils, validateEntityId } from '~/core/utils/utils';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';

/**
 * The tabs the topic page owns, as they appear in `?tabId=`.
 *
 * Reserved words rather than a parameter of their own, and they cannot collide with an entity tab
 * by construction: every reader of `tabId` runs the value through `validateEntityId` first and
 * treats anything else as absent — `tabIdFromEntityTabHref` in `TabGroup`,
 * `useTabIdFromSearchParams` in the editor provider, and the side panel's own setter all do it
 * already. So `?tabId=claims` is invisible to the entity-tab machinery, and no entity id can ever
 * spell one of these.
 */
export const TOPIC_BUILT_IN_TAB_IDS = ['claims', 'debates', 'coverage'] as const;

export type TopicBuiltInTab = 'overview' | (typeof TOPIC_BUILT_IN_TAB_IDS)[number];

export function isTopicBuiltInTabId(value: string | null | undefined): value is TopicBuiltInTab {
  return value != null && (TOPIC_BUILT_IN_TAB_IDS as readonly string[]).includes(value);
}

export type TopicActiveTab = {
  /** Which of the page's own tabs is showing. `overview` whenever an entity tab is. */
  builtIn: TopicBuiltInTab;
  /** The entity tab showing, if any. Mutually exclusive with a non-overview `builtIn`. */
  entityTabId: string | null;
};

/**
 * Which tab the topic page is on, across both surfaces.
 *
 * The route keeps it in `?tabId=`, where a built-in and an entity tab are mutually exclusive
 * because they are the same parameter — which is the point of the reserved words.
 *
 * The side panel cannot do that. Its `EntitySidePanelActiveTabProvider` validates every value it
 * stores as an entity id and drops anything else, and widening that would hand the editor provider
 * — which shares the context — a tab id it has no blocks for. So in the panel the two live apart:
 * the entity tab stays in the context that already owns it, and the built-in is the panel-local
 * state the caller passes in. Selecting one clears the other, which is what keeps them exclusive
 * in the surface that cannot make them exclusive by construction.
 */
export function useTopicActiveTab(panelBuiltInTab: TopicBuiltInTab): TopicActiveTab {
  const searchParams = useSearchParams();
  const sidePanelTab = useEntitySidePanelActiveTab();

  const rawUrlTabId = searchParams?.get('tabId') ?? null;

  if (sidePanelTab) {
    const entityTabId = sidePanelTab.activeTabId;
    return { builtIn: entityTabId ? 'overview' : panelBuiltInTab, entityTabId };
  }

  if (validateEntityId(rawUrlTabId)) return { builtIn: 'overview', entityTabId: rawUrlTabId };
  return { builtIn: isTopicBuiltInTabId(rawUrlTabId) ? rawUrlTabId : 'overview', entityTabId: null };
}

type BuiltInTabSpec = {
  id: TopicBuiltInTab;
  label: string;
  /** Undefined on Overview, which has no count of its own to report. */
  count?: number;
};

/**
 * The topic page's tab bar: the four surfaces the page owns, then everything the entity carries.
 *
 * Built-ins first, in a fixed order, so every topic opens the same way regardless of what its
 * editors wrote — the same argument the page's section order already makes. The editorial tabs keep
 * their authored `position` order among themselves, behind a divider that says the two groups are
 * different in kind without spending a word on it.
 *
 * Built on `tabGroupTabLinkStyles` and the shared `layoutId` underline rather than `TabGroup`,
 * which is the pattern the debates hub, the personal home dashboard and the ranking block already
 * use for a tab row that is not a list of entity tabs. `TabGroup` decides "active" by comparing
 * hrefs against the entity-tab machinery, and the reserved ids are deliberately invisible to it.
 *
 * Counts are omitted, not zeroed, until {@link useTopicTabCounts} reports them ready — see the note
 * there on why a number that arrives late beats one that corrects itself. A built-in whose count is
 * known to be zero is dropped rather than disabled: an empty tab is a promise the page cannot keep,
 * and `Middle East` has no debates across 1,768 claims.
 *
 * Not `Badge`: that is the black notification pill the hub uses for pending requests, and putting
 * it on three tabs at once would make the bar shout. A count here is a quiet number beside a label.
 */
export function TopicTabs({
  entityId,
  spaceId,
  activeTab,
  onSelectBuiltIn,
  onSelectEntityTab,
  counts,
  countsReady,
  entityTabs,
}: {
  entityId: string;
  spaceId: string;
  activeTab: TopicActiveTab;
  onSelectBuiltIn: (tab: TopicBuiltInTab) => void;
  onSelectEntityTab: (tabId: string) => void;
  counts: { claims: number; debates: number; coverage: number };
  countsReady: boolean;
  entityTabs: TabEntity[];
}) {
  const sidePanelTab = useEntitySidePanelActiveTab();
  const isPanel = sidePanelTab != null;
  const overviewHref = NavUtils.toEntity(spaceId, entityId);
  const underlineId = React.useId();

  const builtIns: BuiltInTabSpec[] = (
    [
      { id: 'overview', label: 'Overview' },
      { id: 'claims', label: 'Claims', count: counts.claims },
    { id: 'debates', label: 'Debates', count: counts.debates },
      { id: 'coverage', label: 'Coverage', count: counts.coverage },
    ] satisfies BuiltInTabSpec[]
  ).filter(tab => tab.id === 'overview' || !countsReady || (tab.count ?? 0) > 0);

  const named = entityTabs.filter(tab => (tab.name ?? '').trim().length > 0);

  function renderTab(key: string, label: string, active: boolean, count: number | undefined, onSelect: () => void, href: string) {
    const content = (
      <>
        {label}
        {count !== undefined && countsReady ? (
          <span className="text-metadata text-grey-04 tabular-nums">{count}</span>
        ) : null}
        {active ? (
          <motion.div
            layoutId={underlineId}
            layout
            initial={false}
            transition={{ duration: 0.2 }}
            className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text"
          />
        ) : null}
      </>
    );

    // A button in the panel, which has no URL of its own to put this in; a real anchor on the
    // route, so the tab can be linked, opened in a new tab and restored by a reload.
    return isPanel ? (
      <button
        key={key}
        type="button"
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
        className={tabGroupTabLinkStyles({ active })}
      >
        {content}
      </button>
    ) : (
      <Link key={key} href={href} aria-current={active ? 'true' : undefined} className={tabGroupTabLinkStyles({ active })}>
        {content}
      </Link>
    );
  }

  return (
    <div className="relative">
      {/* `w-max` so the labels never compress, inside a scroller — a topic can carry fifteen tabs
          (`Ukraine's presidential wartime elections` does) and the last of them must stay reachable
          rather than being cut off by the container. */}
      <div className="no-scrollbar overflow-x-auto">
        <div className="relative flex w-max items-center gap-6 pb-2">
          {builtIns.map(tab =>
            renderTab(
              tab.id,
              tab.label,
              activeTab.entityTabId === null && activeTab.builtIn === tab.id,
              tab.count,
              () => onSelectBuiltIn(tab.id),
              tab.id === 'overview' ? overviewHref : `${overviewHref}?tabId=${tab.id}`
            )
          )}

          {named.length > 0 ? (
            <span aria-hidden className="h-4 w-px shrink-0 bg-grey-02" />
          ) : null}

          {named.map(tab =>
            renderTab(
              tab.id,
              tab.name ?? '',
              activeTab.entityTabId === tab.id,
              undefined,
              () => onSelectEntityTab(tab.id),
              `${overviewHref}?tabId=${tab.id}`
            )
          )}
        </div>
      </div>
      {/* Outside the scroller so the rule spans the visible row rather than the scrollable width —
          the same arrangement `TabGroup` and the debates hub use. */}
      <div className={cx('absolute right-0 bottom-0 left-0 z-0 h-px bg-grey-02')} />
    </div>
  );
}

/**
 * The control that takes Overview's preview of a section to that section's own tab.
 *
 * "View all" here means a tab switch, not a route — Overview is the curated read and the tabs are
 * where volume lives, and both are the same page. A link on the route so it can be opened in a new
 * tab like any other; a button in the panel, which has no URL to put this in.
 */
export function TopicViewAll({
  entityId,
  spaceId,
  tab,
  count,
  onSelect,
}: {
  entityId: string;
  spaceId: string;
  tab: Exclude<TopicBuiltInTab, 'overview'>;
  /** Omitted until the counts resolve, so this never promises a number it may correct. */
  count?: number;
  onSelect: (tab: TopicBuiltInTab) => void;
}) {
  const sidePanelTab = useEntitySidePanelActiveTab();
  const label = count === undefined ? 'View all' : `View all ${count}`;
  const className = 'text-metadata text-ctaPrimary transition-colors hover:text-ctaHover';

  if (sidePanelTab) {
    return (
      <button type="button" onClick={() => onSelect(tab)} className={className}>
        {label}
      </button>
    );
  }

  return (
    <Link href={`${NavUtils.toEntity(spaceId, entityId)}?tabId=${tab}`} className={className}>
      {label}
    </Link>
  );
}
