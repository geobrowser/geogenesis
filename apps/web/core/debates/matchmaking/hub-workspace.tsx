'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { Text } from '~/design-system/text';

import { useGeoChatAuth } from '../hooks';
import { fromClaimsFilterSearch } from './claims-filter-params';
import { ClaimsTab } from './claims-tab';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubLiveRail } from './hub-live-rail';
import { MatchesList } from './matches-list';
import type { DebatesHubTab } from '~/atoms';

/**
 * Which claims the centre column is showing.
 */
type HubList = 'featured' | 'all' | 'mine' | 'debate_now' | 'matches';

const LIST_OPTIONS: HubFilterOption<HubList>[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'all', label: 'All claims' },
  { value: 'mine', label: 'My positions' },
  { value: 'debate_now', label: 'Debate now' },
  { value: 'matches', label: 'Matches' },
];

/**
 * The two sources a signed-out viewer can be offered, and the reason the other three cannot.
 */
const SIGNED_OUT_LISTS: HubList[] = ['featured', 'all'];

/**
 * Full-screen matchmaking hub (GEO-2726): claims centre, facet + live rails.
 * Named `@container/hub` collapse: facets first, then live; narrow falls back to panel menus.
 * Width is capped by the shell's 1200px `<main>`.
 */
export function DebatesHubWorkspace() {
  const [list, setList] = React.useState<HubList>('featured');

  const { authenticated } = useGeoChatAuth();

  const searchParams = useSearchParams();
  const seedApplied = React.useRef(false);
  React.useEffect(() => {
    if (seedApplied.current || !searchParams) return;
    seedApplied.current = true;

    const asked = fromClaimsFilterSearch(
      new URLSearchParams(searchParams.toString()),
      LIST_OPTIONS.map(option => option.value)
    ).list;
    if (asked) setList(asked);
  }, [searchParams]);
  const options = React.useMemo(
    () => (authenticated ? LIST_OPTIONS : LIST_OPTIONS.filter(option => SIGNED_OUT_LISTS.includes(option.value))),
    [authenticated]
  );

  const shown = options.some(option => option.value === list) ? list : 'featured';

  const showList = React.useCallback((tab: DebatesHubTab) => {
    if (tab === 'explore') setList('all');
    else if (tab === 'positions') setList('mine');
    else if (tab === 'lobby') setList('debate_now');
  }, []);

  const picker = (
    <HubFilterMenu
      label={options.find(option => option.value === shown)?.label ?? 'Featured'}
      options={options}
      value={shown}
      onChange={setList}
      size="field"
    />
  );

  return (
    <div className="@container/hub flex w-full flex-col">
      <header className="sticky top-11 z-20 flex items-center justify-between gap-3 bg-white px-4 py-5">
        <Text as="h1" variant="mainPage" color="text">
          Debates
        </Text>
      </header>

      <div className="flex gap-8 px-4">
        <div className="min-w-0 flex-1">
          {shown === 'matches' ? (
            <MatchesList onTabChange={showList} layout="workspace" scopePicker={picker} />
          ) : (
            <ClaimsTab
              variant={
                shown === 'debate_now'
                  ? 'lobby'
                  : shown === 'mine'
                    ? 'positions'
                    : shown === 'featured'
                      ? 'featured'
                      : 'explore'
              }
              layout="workspace"
              scopePicker={picker}
            />
          )}
        </div>

        <aside
          aria-label="Live"
          className="sticky top-[7.5rem] hidden max-h-[calc(100dvh-8.5rem)] w-80 shrink-0 self-start overflow-y-auto @[64rem]/hub:block"
        >
          <HubLiveRail />
        </aside>
      </div>
    </div>
  );
}
