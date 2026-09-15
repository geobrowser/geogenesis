'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { Text } from '~/design-system/text';

import { useGeoChatAuth } from '../hooks';
import { fromClaimsFilterSearch } from './claims-filter-params';
import { ClaimsTab, type ClaimsTabVariant } from './claims-tab';
import { HubFilterMenu, type HubFilterOption } from './hub-filter-menu';
import { HubLiveRail } from './hub-live-rail';
import { LobbyTab } from './lobby-tab';
import type { DebatesHubTab } from '~/atoms';

const LIST_OPTIONS: HubFilterOption<ClaimsTabVariant>[] = [
  { value: 'lobby', label: 'Lobby' },
  { value: 'explore', label: 'Explore' },
  { value: 'positions', label: 'My positions' },
];

/**
 * The one a signed-out viewer can be offered, and the reason the other two cannot.
 */
const SIGNED_OUT_LISTS: ClaimsTabVariant[] = ['explore'];

/**
 * Full-screen matchmaking hub (GEO-2726): claims centre, facet + live rails.
 * Named `@container/hub` collapse: facets first, then live; narrow falls back to panel menus.
 * Width is capped by the shell's 1200px `<main>`.
 */
export function DebatesHubWorkspace() {
  const [list, setList] = React.useState<ClaimsTabVariant>('lobby');

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

  const shown = options.some(option => option.value === list) ? list : 'explore';

  const showList = React.useCallback((tab: DebatesHubTab) => {
    if (tab === 'explore' || tab === 'positions' || tab === 'lobby') setList(tab);
  }, []);

  const picker = (
    <HubFilterMenu
      label={options.find(option => option.value === shown)?.label ?? 'Explore'}
      options={options}
      value={shown}
      onChange={setList}
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
          {shown === 'lobby' ? (
            <LobbyTab onTabChange={showList} layout="workspace" scopePicker={picker} />
          ) : (
            <ClaimsTab variant={shown} layout="workspace" scopePicker={picker} />
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
