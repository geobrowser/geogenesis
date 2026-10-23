'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { MatchmakingClaim } from '../api';
import { type ClaimsListVariant, ClaimsTab } from './claims-tab';
import type { HubSortOption, PanelListFilters } from './hub-filters';
import { MatchesList } from './matches-list';
import {
  type DebatesHubExploreShow,
  type DebatesHubExploreSort,
  type DebatesHubMatchesSort,
  type DebatesHubTab,
  debatesHubExploreShowAtom,
  debatesHubExploreSomeoneOnlineAtom,
  debatesHubExploreSortAtom,
  debatesHubMatchesIncludeOfflineAtom,
  debatesHubMatchesSortAtom,
} from '~/atoms';

const MATCHES_SORTS: HubSortOption<DebatesHubMatchesSort>[] = [
  { value: 'best', label: 'Best' },
  { value: 'newest', label: 'Newest' },
  { value: 'people', label: 'Most people' },
];

const EXPLORE_SORTS: HubSortOption<DebatesHubExploreSort>[] = [
  { value: 'best', label: 'Best' },
  { value: 'newest', label: 'Newest' },
];

const EXPLORE_SHOWS: HubSortOption<DebatesHubExploreShow>[] = [
  { value: 'unanswered', label: 'Not answered' },
  { value: 'all', label: 'All', chipLabel: 'All claims' },
  { value: 'mine', label: 'My positions' },
];

/** The side the viewer is not on, for a claim they hold. */
function opposingSides(entry: MatchmakingClaim) {
  const viewerSide = entry.viewer_response?.position;
  return viewerSide === undefined ? [] : entry.positions.filter(position => position.position !== viewerSide);
}

/** A claim where the viewer holds a side and someone holds the other, online or not. */
function hasSomeoneOnTheOtherSide(entry: MatchmakingClaim) {
  return opposingSides(entry).some(position => position.total_count > 0);
}

/** A claim where someone online holds a side, which Debate now can act on straight away. */
function hasSomeoneOnline(entry: MatchmakingClaim) {
  return entry.positions.some(position => position.available_now_count > 0);
}

/**
 * The panel's Matches tab (GEO-3463): claims where you and someone online hold opposite sides —
 * geo-chat's own match list, and only that (decision 39).
 *
 * "Include people who are offline" widens it to every claim you hold where someone holds the other
 * side, online or not. geo-chat's match list has no notion of offline people, so that list is your
 * positions narrowed to those claims; the card offers Schedule where nobody on the other side is
 * online. The search and the spaces and topics picked are shared by both, so the switch narrows or
 * widens what is on screen rather than starting over.
 */
export function PanelMatchesTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
  const [sort, setSort] = useAtom(debatesHubMatchesSortAtom);
  const [includeOffline, setIncludeOffline] = useAtom(debatesHubMatchesIncludeOfflineAtom);

  const filters = React.useMemo<PanelListFilters>(
    () => ({
      sort: { options: MATCHES_SORTS, value: sort, onChange: next => setSort(next as DebatesHubMatchesSort) },
      toggles: [
        {
          id: 'include-offline',
          label: 'Include people who are offline',
          chipLabel: 'Incl. offline',
          checked: includeOffline,
          onChange: setIncludeOffline,
        },
      ],
      onClearExtras: () => setIncludeOffline(false),
      clientSort: sort,
    }),
    [includeOffline, setIncludeOffline, setSort, sort]
  );

  return includeOffline ? (
    <ClaimsTab
      variant="positions"
      atomsFrom="lobby"
      panelFilters={filters}
      keepClaim={hasSomeoneOnTheOtherSide}
      onTabChange={onTabChange}
    />
  ) : (
    <MatchesList onTabChange={onTabChange} panelFilters={filters} />
  );
}

/**
 * The panel's Explore tab (GEO-3463). One list under a Show control — Not answered (the default, and
 * what Explore already did, GEO-2863), All, or My positions, which used to be a tab of its own — and
 * "Someone online to debate", which narrows to claims Debate now can act on straight away and
 * replaces the old Live tab's default list (decision 39).
 *
 * Each combination is whichever source answers it best rather than one list filtered every way:
 * the Debate tag for browsing, geo-chat's `debate_now` for "someone online", the viewer's own
 * positions for My positions. All three read Explore's search and picks, so changing Show keeps them.
 */
export function PanelExploreTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
  const [sort, setSort] = useAtom(debatesHubExploreSortAtom);
  const [show, setShow] = useAtom(debatesHubExploreShowAtom);
  const [someoneOnline, setSomeoneOnline] = useAtom(debatesHubExploreSomeoneOnlineAtom);

  const variant: ClaimsListVariant = show === 'mine' ? 'positions' : someoneOnline ? 'lobby' : 'explore';

  const filters = React.useMemo<PanelListFilters>(
    () => ({
      sort: { options: EXPLORE_SORTS, value: sort, onChange: next => setSort(next as DebatesHubExploreSort) },
      choice: {
        heading: 'Show',
        options: EXPLORE_SHOWS,
        value: show,
        defaultValue: 'unanswered',
        onChange: next => setShow(next as DebatesHubExploreShow),
      },
      toggles: [
        {
          id: 'someone-online',
          label: 'Someone online to debate',
          chipLabel: 'Someone online',
          checked: someoneOnline,
          onChange: setSomeoneOnline,
        },
      ],
      onClearExtras: () => {
        setShow('unanswered');
        setSomeoneOnline(false);
      },
      // The tag answers in either order; the geo-chat lists are sorted in hand.
      graphOrder: variant === 'explore' ? sort : undefined,
      clientSort: variant === 'explore' ? undefined : sort,
    }),
    [setShow, setSomeoneOnline, setSort, show, someoneOnline, sort, variant]
  );

  // What the chosen source cannot be asked for. `debate_now` keeps answered claims, so Not answered
  // is applied to it here; My positions has no online filter, so that one is applied here too.
  const keepClaim = React.useMemo(() => {
    if (variant === 'lobby' && show === 'unanswered')
      return (entry: MatchmakingClaim) => entry.viewer_response === null;
    if (variant === 'positions' && someoneOnline) return hasSomeoneOnline;
    return undefined;
  }, [show, someoneOnline, variant]);

  return (
    <ClaimsTab
      key={variant}
      variant={variant}
      atomsFrom="explore"
      panelFilters={filters}
      keepClaim={keepClaim}
      onTabChange={onTabChange}
    />
  );
}
