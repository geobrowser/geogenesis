'use client';

import * as React from 'react';

import { useAtom } from 'jotai';

import type { MatchmakingClaim } from '../api';
import { useDebateActivity, useGeoChatAuth, useUpdateDebateAvailability } from '../hooks';
import { type ClaimsListVariant, ClaimsTab } from './claims-tab';
import { useMatchmakingMatches } from './hooks';
import { otherSideHeld } from './hub-claim-end-slot';
import type { HubSortOption, PanelListFilters } from './hub-filters';
import { HubPillButton } from './hub-pill-button';
import { MatchesList } from './matches-list';
import { opposingPositions } from './opposing-positions';
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
  return opposingPositions(entry.positions, entry.viewer_response?.position);
}

/** A claim where the viewer holds a side and someone holds the other, online or not. */
function hasSomeoneOnTheOtherSide(entry: MatchmakingClaim) {
  return otherSideHeld(entry.positions, entry.viewer_response?.position);
}

/**
 * A claim of yours where someone online holds the other side, which Debate now can act on straight
 * away. Only the other side: someone online who agrees with you is no one to debate, and the card
 * would offer Schedule.
 */
function hasSomeoneOnlineOpposite(entry: MatchmakingClaim) {
  return opposingSides(entry).some(position => position.available_now_count > 0);
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
 *
 * With nobody who disagrees online, the tab does not stop at saying so: it shows that wider list on
 * its own, under a line that says why, without touching the stored switch — so the moment a match
 * comes online the tab is back to matches. Unavailable, a card says so and offers Turn on first.
 */
export function PanelMatchesTab({ onTabChange }: { onTabChange: (tab: DebatesHubTab) => void }) {
  const [sort, setSort] = useAtom(debatesHubMatchesSortAtom);
  const [includeOffline, setIncludeOffline] = useAtom(debatesHubMatchesIncludeOfflineAtom);
  const { data: activity } = useDebateActivity(true);
  const matchesQuery = useMatchmakingMatches(true);
  // Read off the last answer in hand. A first load or a failed one is not "nobody is online". A
  // background refresh is not a new answer either: react-query keeps the previous data through it,
  // and gating on `isFetching` swapped to the bare match list and back on every refresh, flashing
  // that list's empty state in between (26 Oct).
  const nobodyOnline = matchesQuery.data !== undefined && !matchesQuery.error && matchesQuery.data.matches.length === 0;
  const showsOffline = includeOffline || nobodyOnline;

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
      emptyPredicate: {
        message: 'Nobody holds the other side of a claim you’ve answered yet.',
        action: { label: 'Explore claims', onClick: () => onTabChange('explore') },
      },
    }),
    [includeOffline, onTabChange, setIncludeOffline, setSort, sort]
  );

  const notice =
    activity?.available_to_debate === false || (nobodyOnline && !includeOffline) ? (
      <div className="flex flex-col gap-4">
        {activity?.available_to_debate === false ? <NotAvailableCard /> : null}
        {nobodyOnline && !includeOffline ? (
          <div data-testid="matches-nobody-online">
            <h3 className="text-quoteMedium text-text">Nobody who disagrees with you is online</h3>
            <p className="text-breadcrumb text-grey-04">
              These claims have someone on the other side. Pick a time and they get an invite.
            </p>
          </div>
        ) : null}
      </div>
    ) : null;

  return showsOffline ? (
    <ClaimsTab
      variant="positions"
      atomsFrom="panelMatches"
      panelFilters={filters}
      keepClaim={hasSomeoneOnTheOtherSide}
      notice={notice}
      onTabChange={onTabChange}
    />
  ) : (
    <MatchesList atomsFrom="panelMatches" onTabChange={onTabChange} panelFilters={filters} notice={notice} />
  );
}

/** The Panel-Empty board's card: what being unavailable means here, and the one press that fixes it. */
function NotAvailableCard() {
  const updateAvailability = useUpdateDebateAvailability();
  return (
    <div data-testid="matches-not-available" className="flex items-center gap-3 rounded-xl bg-grey-01 p-3.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-metadataMedium text-text">You’re not available now</span>
      </div>
      <HubPillButton
        variant="primary"
        analyticsLabel="Debate hub Turn on availability"
        analyticsIntent="update_debate_availability"
        disabled={updateAvailability.isPending}
        onClick={() => updateAvailability.mutate(true)}
      >
        Turn on
      </HubPillButton>
    </div>
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
export function PanelExploreTab({
  onTabChange,
  warm = false,
}: {
  onTabChange: (tab: DebatesHubTab) => void;
  /**
   * Run the queries, draw nothing: the panel keeps one of these behind the other tabs so Explore is
   * warm when the viewer gets there (GEO-2863). It has to be this tab, not a bare `ClaimsTab warm`:
   * that one ran with full screen's settings, so it seeded the viewer's spaces into Explore's
   * selection, which under the panel's AND emptied the list (26 Oct), and it warmed queries the
   * panel's Explore never asks for.
   */
  warm?: boolean;
}) {
  const [sort, setSort] = useAtom(debatesHubExploreSortAtom);
  const [show, setShow] = useAtom(debatesHubExploreShowAtom);
  const [someoneOnline, setSomeoneOnline] = useAtom(debatesHubExploreSomeoneOnlineAtom);
  // Show and "Someone online" are both about the viewer — what they have answered, who could debate
  // *them* — so signed out there is only the tag to browse, and neither control is offered.
  const { authenticated } = useGeoChatAuth();

  const variant: ClaimsListVariant = !authenticated
    ? 'explore'
    : show === 'mine'
      ? 'positions'
      : someoneOnline
        ? 'lobby'
        : 'explore';

  const filters = React.useMemo<PanelListFilters>(
    () => ({
      sort: { options: EXPLORE_SORTS, value: sort, onChange: next => setSort(next as DebatesHubExploreSort) },
      choice: authenticated
        ? {
            heading: 'Show',
            options: EXPLORE_SHOWS,
            value: show,
            defaultValue: 'unanswered',
            onChange: next => setShow(next as DebatesHubExploreShow),
          }
        : undefined,
      toggles: authenticated
        ? [
            {
              id: 'someone-online',
              label: 'Someone online to debate',
              chipLabel: 'Someone online',
              checked: someoneOnline,
              onChange: setSomeoneOnline,
            },
          ]
        : [],
      onClearExtras: () => {
        setShow('unanswered');
        setSomeoneOnline(false);
      },
      // An empty list here is one Show or the switch narrowed, and "Explore claims" would be this
      // tab, so the way out undoes that instead.
      emptyAction:
        variant === 'positions'
          ? { label: 'Show all claims', onClick: () => setShow('all') }
          : variant === 'lobby'
            ? { label: 'Turn off Someone online', onClick: () => setSomeoneOnline(false) }
            : undefined,
      // The tag answers in either order; the geo-chat lists are sorted in hand.
      graphOrder: variant === 'explore' ? sort : undefined,
      clientSort: variant === 'explore' ? undefined : sort,
    }),
    [authenticated, setShow, setSomeoneOnline, setSort, show, someoneOnline, sort, variant]
  );

  // What the chosen source cannot be asked for. My positions has no online filter, so that one is
  // applied here.
  const keepClaim = variant === 'positions' && someoneOnline ? hasSomeoneOnlineOpposite : undefined;
  const panelFilters = React.useMemo<PanelListFilters>(
    () =>
      keepClaim
        ? {
            ...filters,
            emptyPredicate: {
              message: 'Nobody who disagrees with you is online right now.',
              action: { label: 'Turn off Someone online', onClick: () => setSomeoneOnline(false) },
            },
          }
        : filters,
    [filters, keepClaim, setSomeoneOnline]
  );

  return (
    <ClaimsTab
      key={variant}
      variant={variant}
      atomsFrom="panelExplore"
      panelFilters={panelFilters}
      keepClaim={keepClaim}
      // `debate_now` keeps the claims you have answered. Under Not answered they fold away the way
      // Explore's do, which also holds one you answer in front of you long enough to press its new
      // Debate now, instead of dropping it on the next refetch.
      collapsesAnswered={variant === 'lobby' ? show === 'unanswered' : undefined}
      onTabChange={onTabChange}
      warm={warm}
    />
  );
}
