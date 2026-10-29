'use client';

import * as React from 'react';

import { useStore } from 'jotai';
import { useSearchParams } from 'next/navigation';

import { Text } from '~/design-system/text';

import { DrawnHubListProvider, useDrawnHubList } from '../debate-claim-card-surface';
import { useGeoChatAuth } from '../hooks';
import { useTodaysCallout } from '../todays-claims/use-todays-callout';
import { fromClaimsFilterSearch } from './claims-filter-params';
import {
  ClaimsTab,
  type ClaimsTabVariant,
  DEFAULT_WORKSPACE_LIST,
  VARIANT_ATOMS,
  readUrlSeed,
  useRecordHubTabPress,
} from './claims-tab';
import { HubAskProvider } from './hub-ask-context';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubHeaderControls } from './hub-header-controls';
import { HubLiveRail } from './hub-live-rail';
import { HubSkeleton } from './hub-states';
import { LobbyTab } from './lobby-tab';
import { TodaysClaimsCallout } from './todays-claims-callout';
import { useHubFilterOwner } from './use-hub-filter-owner';
import { isWorkspaceList, useWorkspaceQuery, workspaceHref } from './use-workspace-query';
import type { DebatesHubTab } from '~/atoms';

const LIST_OPTIONS: HubFilterOption<ClaimsTabVariant>[] = [
  { value: 'explore', label: 'Explore' },
  { value: 'lobby', label: 'Matches' },
  { value: 'positions', label: 'My positions' },
];

/**
 * The one a signed-out viewer can be offered, and the reason the other two cannot.
 */
const SIGNED_OUT_LISTS: ClaimsTabVariant[] = ['explore'];

/**
 * How long the list has to sit still before the URL is rewritten to match it. Typing in search
 * would otherwise rewrite it per keystroke, and Safari throws once a page calls `replaceState` too
 * often.
 */
export const URL_SYNC_DELAY_MS = 300;

/**
 * Full-screen matchmaking hub (GEO-2726): claims centre, facet + live rails.
 * Named `@container/hub` collapse: facets first, then live; narrow falls back to panel menus.
 * Width is capped by the shell's 1200px `<main>`.
 */
export function DebatesHubWorkspace() {
  const [list, setList] = React.useState<ClaimsTabVariant>(DEFAULT_WORKSPACE_LIST);

  const { ready, authenticated, accountKey } = useGeoChatAuth();

  const searchParams = useSearchParams();
  const store = useStore();

  // The last query this workspace either applied or wrote itself. Writing one changes
  // `searchParams` like a navigation does, and this is how the seed below knows not to read the
  // workspace's own write back as a link — which would trim a trailing space off a search mid-word.
  const appliedQuery = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    if (!searchParams) return;

    const query = searchParams.toString();
    if (appliedQuery.current === query) return;
    const isFirstPass = appliedQuery.current === undefined;
    appliedQuery.current = query;

    const asked = fromClaimsFilterSearch(
      new URLSearchParams(query),
      LIST_OPTIONS.map(option => option.value)
    ).list;

    const opened = asked ?? DEFAULT_WORKSPACE_LIST;
    setList(opened);

    const seed = readUrlSeed(opened, query);
    if (!seed) return;

    const narrows = Boolean(seed.search) || seed.spaceIds.length > 0 || seed.topicIds.length > 0;
    if (isFirstPass && !narrows) return;

    const atoms = VARIANT_ATOMS[opened];
    store.set(atoms.search, seed.search);
    store.set(atoms.topicIds, [...seed.topicIds]);
    store.set(atoms.spaceIds, [...seed.spaceIds]);
    store.set(atoms.seedSpent, narrows);
  }, [searchParams, store]);
  const options = React.useMemo(
    () => (authenticated ? LIST_OPTIONS : LIST_OPTIONS.filter(option => SIGNED_OUT_LISTS.includes(option.value))),
    [authenticated]
  );

  const shown = options.some(option => option.value === list) ? list : 'explore';

  const filtersReconciled = useHubFilterOwner(accountKey ?? null, ready);

  // GEO-3298. The URL used to be read on arrival and never written, so it described the link that
  // opened the page rather than the list on it — a link copied after any change shared a different
  // setup. Now every change to the list or its filters is written back, so the address bar is
  // always a link to what is on screen.
  //
  // `replaceState`, not a push: a history entry per keystroke or toggle would make Back step
  // through every filter instead of leaving the hub. Held until Privy has restored the session and
  // the filter bar has been handed to this account — before then `shown` is the signed-out
  // fallback and the atoms may be about to be reset, and writing either would replace the link
  // with something the viewer never chose.
  //
  // The delay also covers arrival: on the commit a URL is applied, this still sees the values from
  // before it, and the re-render that brings the new ones cancels that write before it lands.
  const query = useWorkspaceQuery(shown);
  React.useEffect(() => {
    if (!ready || !filtersReconciled || appliedQuery.current === undefined) return;
    if (query === window.location.search.replace(/^\?/, '')) return;

    const timer = window.setTimeout(() => {
      appliedQuery.current = query;
      window.history.replaceState(null, '', workspaceHref(query));
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, filtersReconciled, query]);

  const showList = React.useCallback((tab: DebatesHubTab) => {
    if (isWorkspaceList(tab)) setList(tab);
  }, []);

  const drawnList = useDrawnHubList();
  const recordTabPress = useRecordHubTabPress(shown, drawnList);
  // GEO-3498. The same callout and progress as the side panel's. The live rail sits beside it here,
  // so a live lobby does not need its place.
  const todaysCallout = useTodaysCallout();
  const picker = (
    <HubFilterMenu
      label={options.find(option => option.value === shown)?.label ?? 'Explore'}
      options={options}
      value={shown}
      onChange={next => {
        recordTabPress(next);
        setList(next);
      }}
    />
  );

  return (
    <DrawnHubListProvider value={drawnList}>
      <div className="@container/hub flex w-full flex-col">
        <header className="sticky top-11 z-20 flex items-center justify-between gap-3 bg-white px-4 py-5">
          <Text as="h1" variant="mainPage" color="text">
            Debates
          </Text>
          {/* The side panel's controls, so going available or setting your week does not mean
              leaving full screen for the panel. */}
          <HubHeaderControls />
        </header>

        {todaysCallout.visible ? (
          <div className="px-4">
            <TodaysClaimsCallout callout={todaysCallout} layout="hub" onFindDebate={() => setList('lobby')} />
          </div>
        ) : null}

        <div className="flex gap-8 px-4">
          {/* Shared claim cards read the open ask here too (GEO-3463, decision 4): "Requesting · m:ss"
              on the card that sent it, the others paused. */}
          <HubAskProvider>
            <div className="min-w-0 flex-1">
              {!ready || !filtersReconciled ? (
                <HubSkeleton />
              ) : shown === 'lobby' ? (
                <LobbyTab onTabChange={showList} layout="workspace" scopePicker={picker} />
              ) : (
                <ClaimsTab key={shown} variant={shown} layout="workspace" scopePicker={picker} />
              )}
            </div>
          </HubAskProvider>

          <aside
            aria-label="Live"
            className="sticky top-[7.5rem] hidden max-h-[calc(100dvh-8.5rem)] w-80 shrink-0 self-start overflow-y-auto @[64rem]/hub:block"
          >
            <HubLiveRail />
          </aside>
        </div>
      </div>
    </DrawnHubListProvider>
  );
}
