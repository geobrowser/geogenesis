'use client';

import * as React from 'react';

import cx from 'classnames';
import { useAtom } from 'jotai';

import { type AnalyticsProperties } from '~/core/analytics';
import { personProfileOpened } from '~/core/analytics';
import { SLOT_MINUTES } from '~/core/availability/blocks';
import { PEER_SCHEDULE_DAYS, slotStarts } from '~/core/availability/peer-schedule';
import type { ScheduleEditorSurface, ScheduleEntry } from '~/core/availability/schedule-analytics';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { type SpaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Calendar } from '~/design-system/icons/calendar';
import { Input } from '~/design-system/input';
import { OnlineDot } from '~/design-system/online-dot';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { AvailabilityModal } from '~/partials/availability/availability-modal';
import { MUTUAL_SLOT, PEER_ONLY_SLOT } from '~/partials/availability/peer-availability';
import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import {
  type DebatePerson,
  GeoChatRequestError,
  RECIPIENT_AWAY_CODE,
  type SchedulablePerson,
  type ScheduleOverlapSlot,
} from '../api';
import {
  useCreateDebateChallenge,
  useDebateActivity,
  useDebateSchedule,
  useGeoChatAuth,
  useSaveDebateSchedule,
} from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
import { HubStickyControls, SpaceTopicFilters } from './claims-tab';
import { DebateHoursNote } from './debate-hours-note';
import type { ClaimMatch } from './disagreement-counts';
import { FilterSwitch } from './filter-switch';
import { useDebatePeople, useDebateRequests, useSchedulablePeople } from './hooks';
import { hubAnalyticsAttributes } from './hub-analytics';
import { HUB_ICON_BUTTON_CLASS_NAME, HubPillButton } from './hub-pill-button';
import { HubQueryState } from './hub-states';
import { isExcludedFromPeopleTab } from './people-tab-exclusions';
import { PersonMatches } from './person-disagreements';
import type { PersonRecord } from './person-record';
import { PersonRecordLine } from './person-record-line';
import { PersonSpaceIcons } from './person-space-icons';
import { useLiveRequestBlock } from './use-live-request-block';
import { usePersonFacts } from './use-person-facts';
import { useSpaceFilterMenu } from './use-space-filter-selection';
import { type DebatesHubTab, debatesHubPeopleOnlineOnlyAtom, debatesHubPeopleSpaceIdsAtom } from '~/atoms';

const EMPTY_SPACE_IDS: string[] = [];
const EMPTY_MATCHES: ClaimMatch[] = [];
const EMPTY_MATCH_COUNTS = new Map<string, number>();
const EMPTY_USER_IDS: ReadonlySet<string> = new Set();

/** Times drawn on an offline row; the rest are behind "More times" (GEO-2937). */
export const INLINE_SLOTS = 3;

/** `viewerIsFree` as on the booking week's chips; unset when the viewer has no hours to compare. */
type ChipSlot = ScheduleOverlapSlot & { viewerIsFree?: boolean };

export type PersonSchedule = { slots: ChipSlot[]; truncated: boolean };

/**
 * The chips on an offline row (GEO-3154). Times they share with the viewer when there are any, as
 * before. Otherwise their own next free times, one per stretch so three chips are not one afternoon,
 * which is all a viewer with no schedule can be offered.
 */
function personSchedule(
  candidate: SchedulablePerson,
  viewerHasSchedule: boolean,
  now: number,
  weekEnds: number
): PersonSchedule {
  const upcoming = (start: number) => start > now && start < weekEnds;
  const shared = candidate.slots.filter(slot => upcoming(Date.parse(slot.start)));
  if (shared.length > 0 || !candidate.their_windows) {
    return {
      slots: shared.slice(0, INLINE_SLOTS).map(slot => ({ ...slot, viewerIsFree: viewerHasSchedule || undefined })),
      truncated: candidate.truncated || shared.length > INLINE_SLOTS,
    };
  }

  // geo-chat drops windows that have started, but one can start between fetches: its first chip is
  // then the next half hour still ahead, on the same grid the week draws.
  const own: ChipSlot[] = [];
  let available = 0;
  for (const window of candidate.their_windows) {
    const starts = slotStarts(window, { after: now }).filter(instant => upcoming(instant.getTime()));
    available += starts.length;
    if (starts.length === 0 || own.length === INLINE_SLOTS) continue;
    own.push({
      start: starts[0].toISOString(),
      end: new Date(starts[0].getTime() + SLOT_MINUTES * 60_000).toISOString(),
      viewerIsFree: viewerHasSchedule ? window.viewer_free : undefined,
    });
  }
  return { slots: own, truncated: available > own.length };
}

/**
 * An offline person drawn in the roster's shape, so search, the space filter and match counts treat
 * them like anyone else. Not requestable: nobody here can take a request right now.
 */
export function schedulableAsPerson({ user }: SchedulablePerson): DebatePerson {
  return {
    ...user,
    online: false,
    available_to_debate: false,
    in_debate: false,
    online_since: null,
    can_challenge: false,
  };
}

/**
 * Everyone online and available right now. The Debate button sends the same claimless challenge as
 * `ProfileDebateButton` on a person's home space — `DebateCoordinator` owns the resulting dialog.
 *
 * With "Online only" off, the default, offline people with free time this week are listed too,
 * ranked by matches alongside everyone online, each with a few of their free times and a Schedule
 * button in place of the request (GEO-2937). That includes a viewer with no hours set (GEO-3154).
 *
 * `dense` (live rail): no sticky chrome; search stays so you can still find a name.
 */
/**
 * `dense` is the live rail (GEO-2726) — see the note on `RequestsTab`. Search stays: a presence
 * list is the one of the three you actually scan for a name.
 */
export function PeopleTab({
  onTabChange,
  dense = false,
}: {
  /** Only reached from the empty state's action, so the rail need not pass one. */
  onTabChange?: (tab: DebatesHubTab) => void;
  dense?: boolean;
}) {
  const { authenticated } = useGeoChatAuth();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'debate_matchmaking',
      auth_control: 'browse_people',
      auth_continuation: 'repeat',
      auth_intent: 'start_debate',
    },
  });
  // Undefined when signed in, so every path below keeps behaving exactly as it did.
  const onRequireSignIn = authenticated ? undefined : promptSignIn;

  const peopleQuery = useDebatePeople(true);
  // Both describe the viewer's own state, so signed out there is nothing to ask for. Passing
  // `authenticated` rather than `true` keeps them from firing a request that can only 401.
  const { data: activity } = useDebateActivity(authenticated);
  const { data: requests } = useDebateRequests(authenticated);
  const currentUserId = useCurrentGeoChatUserId();
  const { personalSpaceId } = usePersonalSpaceId();
  // One elevated portal for every row's menu. A portal per person would append a matching number
  // of containers to the body, while a plain Radix portal sits behind this z-200 panel.
  const popoverPortal = useElevatedPopoverPortal();
  // Held here rather than in the row. Rows follow live data: someone whose free time runs out, or
  // who is blocked, drops out of the list, and a dialog inside their row would vanish mid-read.
  const [viewingTimes, setViewingTimes] = React.useState<{
    userId: string;
    name: string;
    disagreementCount: number | null;
    initialStart?: string;
    entry: ScheduleEntry;
  } | null>(null);
  // The row that opened it, so focus can go back there. It may unmount first; the modal checks.
  const seeTimesOpenerRef = React.useRef<HTMLElement | null>(null);
  const [onlineOnly, setOnlineOnly] = useAtom(debatesHubPeopleOnlineOnlyAtom);
  // Offline people can only be scheduled with, which needs an account to book from.
  const showOffline = authenticated && !onlineOnly;
  const schedulableQuery = useSchedulablePeople(showOffline);
  const viewerHasNoSchedule = showOffline && schedulableQuery.data?.viewer_has_schedule === false;

  const onlinePeople = React.useMemo(
    () => (peopleQuery.data?.people ?? []).filter(person => !isExcludedFromPeopleTab(person.profile_space_id)),
    [peopleQuery.data]
  );
  // Held in state so the slot filters below re-run as time passes; React Compiler caches a
  // `Date.now()` read in render once per mount.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!showOffline) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [showOffline]);

  // Anyone on the roster keeps their roster row: requestable now, or online but away (GEO-3119).
  // Someone online but off the roster (unavailable) stays here.
  const { offlinePeople, schedulesByUser, schedulableUserIds } = React.useMemo(() => {
    const byUser = new Map<string, PersonSchedule>();
    if (!showOffline || !schedulableQuery.data) {
      return { offlinePeople: [], schedulesByUser: byUser, schedulableUserIds: EMPTY_USER_IDS };
    }

    const onRoster = new Set(onlinePeople.map(person => normId(person.user_id)));
    // geo-chat lists everyone with free time this week, online or not, whether or not the viewer
    // has hours of their own (GEO-3153). An away person on it can be booked; one off it has no free
    // time, so their week would open empty and their row offers no Schedule.
    const schedulable = new Set(schedulableQuery.data.people.map(candidate => normId(candidate.user.user_id)));
    const viewerHasSchedule = schedulableQuery.data.viewer_has_schedule;
    // geo-chat's window follows the UTC date, which west of UTC can run a day past the modal's week.
    const today = new Date(now);
    const weekEnds = new Date(today.getFullYear(), today.getMonth(), today.getDate() + PEER_SCHEDULE_DAYS).getTime();
    const offline: DebatePerson[] = [];
    for (const candidate of schedulableQuery.data.people) {
      const key = normId(candidate.user.user_id);
      if (onRoster.has(key) || isExcludedFromPeopleTab(candidate.user.profile_space_id)) continue;
      // Kept with no times left to draw: geo-chat lists everyone with free time, and Schedule
      // still opens their week, where the viewer can book outside their own hours.
      byUser.set(key, personSchedule(candidate, viewerHasSchedule, now, weekEnds));
      offline.push(schedulableAsPerson(candidate));
    }
    return { offlinePeople: offline, schedulesByUser: byUser, schedulableUserIds: schedulable };
  }, [now, onlinePeople, schedulableQuery.data, showOffline]);

  const allPeople = React.useMemo(() => [...onlinePeople, ...offlinePeople], [onlinePeople, offlinePeople]);
  // `allPeople` deliberately falls back to an empty list for rendering, but that fallback is not a
  // roster answer. On a cold load or terminal error, treating it as settled would reconcile a
  // remembered selection against no people and erase it before there is evidence it became invalid.
  const rosterUnavailable = peopleQuery.data === undefined;
  const {
    matchAnalysis,
    matchesKnown,
    matchingSpaceIds,
    matchingClaimNamesById,
    matchingClaimsLoading,
    records,
    personRecordsPending,
    publishableSpacesPending,
    spaceActivityUnavailable,
    debateSpacesByPerson,
    activeSpaceIds,
  } = usePersonFacts(allPeople, { authenticated, rosterUnavailable });

  // Held outside this component so they survive it, exactly as the claim tabs' filters are: the hub
  // closes on any outside pointer-down, so dismissing a dropdown by clicking away unmounts this tab
  // and `useState` would take the viewer's selection with it (GEO-2850).
  const [spaceIds, setSpaceIds] = useAtom(debatesHubPeopleSpaceIdsAtom);

  // Offline people carry spaces too. Until they land, the people in hand are a subset, and
  // reconciling against them would erase a space only offline people are active in.
  const offlinePeopleUnsettled = showOffline && schedulableQuery.data === undefined;

  // Keep the remembered atom untouched until both activity inputs settle, but never let a stale or
  // not-yet-verified value affect the current render. Filtering it synchronously also closes the
  // render between a gate settling and the reconciliation effect below committing its cleanup.
  const effectiveSpaceIds = React.useMemo(
    () =>
      spaceActivityUnavailable ? EMPTY_SPACE_IDS : spaceIds.filter(spaceId => activeSpaceIds.has(normId(spaceId))),
    [activeSpaceIds, spaceActivityUnavailable, spaceIds]
  );

  // A remembered selection can outlive the panel, the activity set, or the publishable set.
  // Reconcile against the exact options this tab is allowed to offer so `keepSelectedVisible`
  // cannot put a disabled, membership-only, or zero-activity space back into the dropdown.
  React.useEffect(() => {
    if (spaceActivityUnavailable || offlinePeopleUnsettled) return;
    setSpaceIds(current => {
      const kept = current.filter(spaceId => activeSpaceIds.has(normId(spaceId)));
      return kept.length === current.length ? current : kept;
    });
  }, [activeSpaceIds, offlinePeopleUnsettled, setSpaceIds, spaceActivityUnavailable]);

  // Filtered here rather than through the query: this endpoint takes no parameters at all and
  // returns whoever is available right now in one unpaginated list, so there is nothing to page
  // back for and every filter below is a slice of what is already in hand.
  const [search, setSearch] = React.useState('');

  // Matching the same label the row renders keeps "search for what you can see" true.
  const searchedPeople = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allPeople;
    return allPeople.filter(person => speakerLabel(person).toLowerCase().includes(term));
  }, [allPeople, search]);

  const people = React.useMemo(() => {
    let filtered = searchedPeople;
    if (effectiveSpaceIds.length > 0) {
      const wanted = new Set(effectiveSpaceIds.map(normId));
      filtered = searchedPeople.filter(person =>
        (debateSpacesByPerson.get(person.profile_space_id) ?? []).some(spaceId => wanted.has(spaceId))
      );
    }

    // Online and offline people share one list ordered by matches. Among equal matches the online
    // person goes first, since they can be asked now; the server's order breaks the remaining ties
    // (roster order online, soonest shared slot offline), so rows stay stable as live updates land.
    return filtered
      .map((person, index) => ({
        person,
        index,
        // Away people sort with the offline: neither can be asked right now.
        online: person.online && !person.away ? 1 : 0,
        matchCount: matchAnalysis.byProfile.get(normId(person.profile_space_id))?.length ?? 0,
      }))
      .sort(
        (left, right) => right.matchCount - left.matchCount || right.online - left.online || left.index - right.index
      )
      .map(({ person }) => person);
  }, [debateSpacesByPerson, effectiveSpaceIds, matchAnalysis, searchedPeople]);

  // Counted over everything the *other* filters leave, which is what a facet count means here as it
  // does on the claim tabs: the number beside a space is what picking it would give you, so it
  // cannot be counted against a space selection that picking it would replace.
  const offeredSpaces = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of searchedPeople) {
      for (const spaceId of debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [debateSpacesByPerson, searchedPeople]);

  // The same menu the claim tabs draw, but People deliberately defaults to "Any space". Passing a
  // spent membership seed prevents the shared menu wiring from auto-selecting the viewer's spaces;
  // an empty selection therefore leaves the full Geo Chat roster visible, including people with no
  // qualifying activity. Explicit selections still persist with the atom above.
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds: effectiveSpaceIds,
    setSpaceIds,
    memberSpaceIds: null,
    pending: peopleQuery.isLoading || spaceActivityUnavailable,
    seedSpent: true,
  });

  // Names and thumbnails for the menu and the row icons in one lookup, so the same space is drawn
  // the same way in both. The viewer's selection is included: a space can be picked and then
  // counted out of the facets, and it still has to be nameable in the trigger.
  const { labelsById } = useSpaceLabels(
    React.useMemo(
      () => [...new Set([...facetSpaces.map(space => space.id), ...effectiveSpaceIds, ...matchingSpaceIds])],
      [effectiveSpaceIds, facetSpaces, matchingSpaceIds]
    )
  );

  // Whether the viewer's own filters are what emptied the list, as opposed to nobody being online.
  // The two empty states, the debate-hours line and the undo action all hang off it, so they cannot
  // disagree about which of the two this is.
  const filtersExcludedEveryone = people.length === 0 && allPeople.length > 0;
  // Which undo to offer. Search alone keeps the wording it had, because a viewer who typed
  // something knows what to take back; once a space filter is involved "Clear search" would name
  // one of the two things holding the list down.
  const searchIsTheOnlyFilter = Boolean(search.trim()) && effectiveSpaceIds.length === 0;

  const { outboundChallenge, blockedReason, buttonsDisabled } = useLiveRequestBlock(activity, requests);

  return (
    <div className="flex flex-col">
      {/* One pinned block, like Matches: a request you are waiting on shouldn't scroll away behind
          the people you can no longer ask, and search shouldn't either. Two stickies would both
          claim `top-0` and overlap, and the card is conditional so search couldn't be offset by a
          known height. */}
      <PeopleControls dense={dense}>
        {outboundChallenge ? <DebateChallengeCard challenge={outboundChallenge} role="requester" /> : null}
        <Input
          withSearchIcon
          value={search}
          onChange={event => setSearch(event.currentTarget.value)}
          placeholder="Search people"
          aria-label="Search people"
        />
        {/* The claim tabs' own filter bar, not a second one built to look like it (GEO-2944).
            Topic props are omitted because people carry no topics to facet on, the same way the
            requests bar omits them. */}
        <SpaceTopicFilters
          analyticsSurface="hub"
          spaceIds={effectiveSpaceIds}
          onSpaceToggle={onSpaceToggle}
          onSpacesClear={onSpacesClear}
          facetSpaces={facetSpaces}
          countsPending={peopleQuery.isLoading || publishableSpacesPending || personRecordsPending}
          trailing={
            authenticated ? (
              <FilterSwitch label="Online only" checked={onlineOnly} onChange={setOnlineOnly} analyticsSurface="hub" />
            ) : undefined
          }
        />
      </PeopleControls>

      {/* Matches the other tabs' inset so content doesn't shift when switching between them. */}
      <div className="px-4 py-3">
        {viewerHasNoSchedule ? <SetAvailabilityNotice /> : null}
        {showOffline && schedulableQuery.error ? (
          <Text as="p" variant="footnote" color="grey-04" className="pb-2">
            Couldn&rsquo;t load who&rsquo;s free this week.{' '}
            <button type="button" className="underline" onClick={() => void schedulableQuery.refetch()}>
              Retry
            </button>
          </Text>
        ) : null}
        <HubQueryState
          analyticsSurface="hub"
          // Offline people land in the same list, so an empty roster is not "nobody" until they have.
          // Online people already in hand are drawn meanwhile; offline rows join them when they land.
          isLoading={peopleQuery.isLoading || (showOffline && schedulableQuery.isLoading && onlinePeople.length === 0)}
          error={peopleQuery.error}
          failureReason={peopleQuery.failureReason}
          // The other three lists have always had this, and the setup state needs it more than the
          // error state did: these reads do not refetch on focus or reconnect, so once the warm-up
          // retries run out this message is as far as the tab gets on its own.
          onRetry={() => void peopleQuery.refetch()}
          isEmpty={people.length === 0}
          // Which of the two empty states this is turns on whether anyone is online *at all*, not
          // on whether the search box has something in it. With nobody available, a search is not
          // what emptied the list — saying it was would blame a filter for the room being empty,
          // and "Clear search" would be an action that changes nothing.
          emptyMessage={
            filtersExcludedEveryone
              ? searchIsTheOnlyFilter
                ? 'Nobody available matches that search.'
                : 'Nobody available matches those filters.'
              : showOffline
                ? // Not "at the same times as you": geo-chat lists everyone free this week, shared
                  // or not, and a viewer with no hours has no times to share (GEO-3154).
                  'Nobody is online or free to debate this week.'
                : 'Nobody is available to debate right now.'
          }
          // GEO-2840 scopes this to the nobody-online case, which is exactly the other side of that
          // same question: a list the viewer emptied with their own search is a different problem,
          // and debate hours does not answer it.
          // The one tab that can show this to a signed-out viewer — People is readable anonymously
          // (GEO-2725), but `useMatchmakingScope` gates the gateway on a session, so their list is
          // static and no amount of waiting will fill it. They cannot be matched either. `live` is
          // what keeps the copy from promising both.
          emptyNote={filtersExcludedEveryone ? undefined : <DebateHoursNote live={authenticated} />}
          // Exactly one action, and which one follows the same question the message and the note do.
          // A search the viewer can undo gets the undo; a room that is genuinely empty gets somewhere
          // to go, because there is nothing to undo and waiting is the only other option (GEO-2840).
          // In the rail there is no tab to change to and the claims list is already on screen beside
          // this, so the "somewhere to go" half has nowhere to send anyone.
          emptyAction={
            filtersExcludedEveryone
              ? searchIsTheOnlyFilter
                ? { label: 'Clear search', onClick: () => setSearch('') }
                : {
                    label: 'Clear filters',
                    onClick: () => {
                      setSearch('');
                      onSpacesClear();
                    },
                  }
              : onTabChange
                ? { label: 'Explore claims', onClick: () => onTabChange('explore') }
                : undefined
          }
          signInAction={
            onRequireSignIn
              ? { label: 'Sign in', message: 'Sign in to see who is available to debate.', onClick: onRequireSignIn }
              : undefined
          }
        >
          <>
            {blockedReason ? (
              <Text as="p" variant="footnote" color="grey-04" className="pb-2">
                {blockedReason}
              </Text>
            ) : null}
            <ul className="flex flex-col">
              {people.map(person => {
                const userKey = normId(person.user_id);
                const isViewer =
                  (currentUserId !== null && person.user_id === currentUserId) ||
                  (personalSpaceId !== null && normId(person.profile_space_id) === normId(personalSpaceId));
                const matches = isViewer
                  ? EMPTY_MATCHES
                  : (matchAnalysis.byProfile.get(normId(person.profile_space_id)) ?? EMPTY_MATCHES);
                return (
                  <PersonRow
                    key={person.user_id}
                    person={person}
                    matches={matches}
                    matchesBySpace={
                      matchesKnown && !isViewer
                        ? (matchAnalysis.countsByProfileAndSpace.get(normId(person.profile_space_id)) ??
                          EMPTY_MATCH_COUNTS)
                        : undefined
                    }
                    claimNamesById={matchingClaimNamesById}
                    claimNamesLoading={matchingClaimsLoading}
                    schedule={schedulesByUser.get(userKey)}
                    canScheduleAway={schedulableUserIds.has(userKey)}
                    record={records.get(person.profile_space_id) ?? null}
                    spaceIds={debateSpacesByPerson.get(person.profile_space_id) ?? EMPTY_SPACE_IDS}
                    labelsById={labelsById}
                    popoverPortal={popoverPortal}
                    disabled={buttonsDisabled}
                    disabledReason={blockedReason ?? 'You have a debate request awaiting a reply.'}
                    onRequireSignIn={onRequireSignIn}
                    onSeeTimes={(peer, opener, entry, initialStart) => {
                      seeTimesOpenerRef.current = opener;
                      // Captured at the click, like the name: the row may leave the list while open.
                      // Unknown until the comparison lands, and an unknown count is left unsaid.
                      setViewingTimes({
                        ...peer,
                        disagreementCount: matchesKnown ? matches.length : null,
                        initialStart,
                        entry,
                      });
                    }}
                  />
                );
              })}
            </ul>
          </>
        </HubQueryState>
      </div>

      {/* Closing returns to the hub, which is where it was opened from. */}
      <PeerAvailabilityBookingModal
        open={viewingTimes !== null}
        userId={viewingTimes?.userId ?? ''}
        peerName={viewingTimes?.name}
        onClose={() => setViewingTimes(null)}
        openerRef={seeTimesOpenerRef}
        initialSelectedStart={viewingTimes?.initialStart}
        entry={viewingTimes?.entry}
        disagreementCount={viewingTimes?.disagreementCount}
      />
    </div>
  );
}

/**
 * Pinned in the panel, plain in the rail. Three pinned headers stacked in one column all claim
 * `top-0` and overlap, which is what made the rail read as several scroll areas side by side.
 */
function PeopleControls({ dense, children }: { dense: boolean; children: React.ReactNode }) {
  if (dense) return <div className="flex flex-col gap-3 px-4 pb-2">{children}</div>;
  return <HubStickyControls>{children}</HubStickyControls>;
}

export function PersonRow({
  person,
  matches,
  matchesBySpace,
  claimNamesById,
  claimNamesLoading,
  schedule,
  times,
  entry,
  canScheduleAway,
  record,
  spaceIds,
  labelsById,
  popoverPortal,
  disabled,
  disabledReason,
  onRequireSignIn,
  onSeeTimes,
}: {
  person: DebatePerson;
  /** Distinct claims on which this person and the viewer hold comparable, opposite positions. */
  matches: ClaimMatch[];
  /** Viewer-relative matching claims per space; absent until that comparison is known. */
  matchesBySpace?: ReadonlyMap<string, number>;
  claimNamesById: ReadonlyMap<string, string | null>;
  claimNamesLoading: boolean;
  /** Set only for an offline row: a few of their upcoming free times, shared ones first. */
  schedule?: PersonSchedule;
  /**
   * Times to offer as chips on a row that is not offline, which `schedule` would redraw as one.
   * Find a time (GEO-3152) lists online people by their free time too.
   */
  times?: PersonSchedule;
  /**
   * Where every week this row opens says it came from. Find a time sets one for the whole row; the
   * People tab leaves it unset, and each control names its own.
   */
  entry?: ScheduleEntry;
  /** Whether an away person has free time the viewer can book. The viewer needs no hours of their own. */
  canScheduleAway: boolean;
  /** Fetched once for the whole list, so a row never asks for its own. Null until that lands. */
  record: PersonRecord | null;
  /** Debate-enabled spaces where this person has at least one claim position or recorded debate. */
  spaceIds: string[];
  /** Resolved once for the tab, so the menu and these icons draw the same space the same way. */
  labelsById: Map<string, SpaceLabel>;
  /** Shared across the list so every row's popup clears the debates panel without one portal each. */
  popoverPortal: HTMLElement | null;
  disabled: boolean;
  /** Only surfaced on hover, so it explains the greyed-out button without repeating the card. */
  disabledReason: string;
  /**
   * Set only when signed out. Pressing Debate then opens Privy instead of sending a request, which
   * would fail at the token exchange with an error the viewer can do nothing about.
   */
  onRequireSignIn?: (properties?: AnalyticsProperties) => void;
  onSeeTimes: (
    peer: { userId: string; name: string },
    opener: HTMLElement | null,
    entry: ScheduleEntry,
    initialStart?: string
  ) => void;
}) {
  const createChallenge = useCreateDebateChallenge();
  // Online but away (GEO-3119): a hidden tab, or nobody at it lately. A live request would go unseen,
  // so the row offers Schedule the way an offline row does — but only when there is a week to book.
  // Otherwise the pill says Away, the way it says In a debate, until they are back.
  const away = Boolean(person.away) && !schedule;
  const offersSchedule = Boolean(schedule) || (away && canScheduleAway);
  // Reached only when Schedule is not offered: someone who cannot take a live request right now.
  const unrequestable = person.in_debate || away;
  const openSchedule = (opener: HTMLElement | null) =>
    onSeeTimes({ userId: person.user_id, name: speakerLabel(person) }, opener, entry ?? 'people_schedule');
  const chips = schedule ?? times;
  const profileHref = validateSpaceId(person.profile_space_id) ? NavUtils.toSpace(person.profile_space_id) : null;
  const activeSpaces =
    spaceIds.length > 0 ? (
      <PersonSpaceIcons
        spaceIds={spaceIds}
        labelsById={labelsById}
        claimsBySpace={record?.claimsBySpace}
        debatesBySpace={record?.debatesBySpace}
        matchesBySpace={matchesBySpace}
        popoverPortal={popoverPortal}
      />
    ) : null;
  const match =
    matches.length > 0 ? (
      <PersonMatches
        personName={speakerLabel(person)}
        matches={matches}
        claimNamesById={claimNamesById}
        claimNamesLoading={claimNamesLoading}
        labelsById={labelsById}
        popoverPortal={popoverPortal}
      />
    ) : null;

  return (
    // Three columns rather than a flex run, so the button sits in its own track instead of sharing a
    // row box with the name — where it was the tallest thing and set the name's line height. The
    // tracks hang from the top, so the face, the name and the button all start on one line: centred,
    // the face and button drifted down to the middle of however many stat lines the row carried.
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-2.5 border-b border-grey-02 py-2.5 last:border-b-0">
      {/* The dot means "can be asked now", the same as inside the claim pills, so offline and away
          rows (GEO-3119) go without it. The clip sits on the inner span: on the
          wrapper it would cut the half of the dot that hangs over the rim. */}
      <div className="relative h-8 w-8 shrink-0">
        <div className="h-8 w-8 overflow-hidden rounded-full">
          <Avatar avatarUrl={person.avatar_cid} value={person.profile_space_id} size={32} />
        </div>
        {/* The face here is 32px, twice the claim pills', so the dot is twice theirs: 8px of green
            in a 4px ring. It carried the pills' 8px dot before, which on a face this size read as
            a speck rather than a badge. */}
        {schedule || away ? null : <OnlineDot faceSize={32} />}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* The name goes to their personal space, which is the profile page GEO-2611 settled on.
            A plain anchor whose click handler only observes analytics: the hub survives the
            navigation on its own now (GEO-2788), so the handler does not intercept it — which is
            also what keeps cmd-click, middle click and "copy link address" working here (GEO-2701).

            Unlinked when the id is not a space id. Rendering an anchor to `/space/undefined`
            would look identical until it was clicked. */}
        {profileHref ? (
          <Link
            href={profileHref}
            onClick={() =>
              personProfileOpened(person.profile_space_id, null, { interaction_surface: 'debates_hub_people' })
            }
            className="min-w-0"
          >
            <Text as="span" variant="metadataMedium" className="block truncate hover:underline">
              {speakerLabel(person)}
            </Text>
          </Link>
        ) : (
          <Text as="p" variant="metadataMedium" className="truncate">
            {speakerLabel(person)}
          </Text>
        )}
        {/* One compact row: debates, positions, then the viewer-relative match count. The
            latter opens the exact claims without making every person row permanently taller. */}
        {/* Says why the pill books a time. When the pill reads Away itself, this would only repeat it. */}
        {away && offersSchedule ? (
          <Text as="p" variant="footnote" color="grey-04">
            Away
          </Text>
        ) : null}
        {record || activeSpaces || match ? (
          <div className="flex min-w-0 flex-col gap-0.5">
            <PersonRecordLine record={record} match={match} activeSpaces={activeSpaces} />
          </div>
        ) : null}
        {chips ? (
          <SharedTimes
            personName={speakerLabel(person)}
            schedule={chips}
            onPick={(start, opener) =>
              onSeeTimes(
                { userId: person.user_id, name: speakerLabel(person) },
                opener,
                entry ?? (start ? 'people_time' : 'people_more_times'),
                start
              )
            }
          />
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Quiet, and deliberately never disabled alongside the pill: someone already in a debate,
            or a viewer whose own request is pending, is exactly who wants to know when this person
            is next free. Gating it on the same reasons would hide it at the moment it earns its
            place. Signed out it opens Privy like the pill does, because the endpoint behind it is
            viewer-scoped and would only 401. */}
        {!offersSchedule && (
          <button
            type="button"
            // Every row carries this control, so the visible label alone leaves a screen reader or
            // voice control with a list of identical targets.
            aria-label={`See times for ${speakerLabel(person)}`}
            {...hubAnalyticsAttributes('See times', 'open_peer_availability')}
            onClick={event =>
              onRequireSignIn
                ? onRequireSignIn({
                    target_id: person.profile_space_id,
                    target_type: 'space',
                    auth_control: 'see_times',
                  })
                : onSeeTimes(
                    { userId: person.user_id, name: speakerLabel(person) },
                    event.currentTarget,
                    entry ?? 'people_see_times'
                  )
            }
            title="See times"
            // An icon rather than text: the stats beside it need the width in a narrow panel.
            className={HUB_ICON_BUTTON_CLASS_NAME}
          >
            <Calendar />
          </button>
        )}
        {offersSchedule ? (
          // Offline and away people cannot take a live request, so the pill books a time instead.
          // Never disabled by the viewer's live request state, for the same reason "See times" is not.
          <HubPillButton
            aria-label={`Schedule a debate with ${speakerLabel(person)}`}
            analyticsLabel="Debate hub Schedule debate"
            analyticsIntent="open_peer_availability"
            onClick={event => openSchedule(event.currentTarget)}
          >
            Schedule
          </HubPillButton>
        ) : (
          <HubPillButton
            // Only the offer is primary. "In a debate" and "Away" are statuses, so they keep the outlined
            // pill and their own text-derived analytics labels.
            variant={unrequestable ? 'secondary' : 'primary'}
            // Pinned to the old label so the analytics series survives the copy change to "Debate now".
            analyticsLabel={unrequestable ? undefined : 'Debate hub Request debate'}
            onClick={() =>
              onRequireSignIn
                ? onRequireSignIn({
                    target_id: person.profile_space_id,
                    target_type: 'space',
                    auth_control: 'start_debate',
                  })
                : createChallenge.mutate(
                    { recipient_profile_space_id: person.profile_space_id },
                    {
                      // They went away after the list loaded (GEO-3119): steer to scheduling rather
                      // than leave the press looking like it did nothing. With no week to book, the
                      // refetched list redraws them as Away instead.
                      onError: error => {
                        if (
                          canScheduleAway &&
                          error instanceof GeoChatRequestError &&
                          error.code === RECIPIENT_AWAY_CODE
                        ) {
                          openSchedule(null);
                        }
                      },
                    }
                  )
            }
            // `in_debate` and `away` hold signed out too: they describe this person rather than any
            // viewer, so signing in would not make them available. `can_challenge` and the viewer's own pending request are the viewer-relative
            // ones, and those are what the press bypasses on its way to the sign-in.
            disabled={unrequestable || (!onRequireSignIn && (!person.can_challenge || disabled))}
            pending={createChallenge.isPending}
            pendingLabel="Requesting…"
            title={
              away
                ? `${speakerLabel(person)} is away. You can request a debate when they're back.`
                : disabled
                  ? disabledReason
                  : undefined
            }
          >
            {person.in_debate ? 'In a debate' : away ? 'Away' : 'Debate now'}
          </HubPillButton>
        )}
      </div>
    </li>
  );
}

/**
 * A few of an offline person's free times, in the viewer's zone. A pick opens their week with that
 * slot selected, which is where the request is confirmed.
 *
 * For a viewer with hours, the week's own looks say which are shared: green when both are free,
 * dashed when only they are. A viewer with no hours shares nothing, so their chips stay plain.
 */
function SharedTimes({
  personName,
  schedule,
  onPick,
}: {
  personName: string;
  schedule: PersonSchedule;
  onPick: (start: string | undefined, opener: HTMLElement) => void;
}) {
  if (schedule.slots.length === 0 && !schedule.truncated) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {schedule.slots.map(slot => (
        <button
          key={slot.start}
          type="button"
          aria-label={`Schedule a debate with ${personName} ${formatSlot(slot.start)}${slot.viewerIsFree ? ", you're both free" : ''}`}
          data-viewer-free={slot.viewerIsFree || undefined}
          // Only a time the viewer is free for too is shared, which keeps the series these chips have
          // always fed. A viewer with no hours (`viewerIsFree` unset) shares none.
          {...hubAnalyticsAttributes(slot.viewerIsFree ? 'Shared time' : 'Free time', 'open_peer_availability')}
          onClick={event => onPick(slot.start, event.currentTarget)}
          className={cx(
            'rounded-full border px-2 py-0.5 text-footnote transition-colors hover:border-text',
            slot.viewerIsFree === undefined
              ? 'border-grey-02 text-text'
              : slot.viewerIsFree
                ? MUTUAL_SLOT
                : PEER_ONLY_SLOT
          )}
        >
          {formatSlot(slot.start)}
        </button>
      ))}
      {schedule.truncated ? (
        <button
          type="button"
          aria-label={`More times for ${personName}`}
          {...hubAnalyticsAttributes('More times', 'open_peer_availability')}
          onClick={event => onPick(undefined, event.currentTarget)}
          className="px-1 text-footnote text-grey-04 transition-colors hover:text-text"
        >
          More times
        </button>
      ) : null}
    </div>
  );
}

/** "Today 3:00 PM", "Tomorrow 9:30 AM", "Thu 6:00 PM" — the range is one week, so a weekday is unambiguous. */
function formatSlot(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round(
    (new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86_400_000
  );
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/**
 * Shown with "Online only" off when the viewer has no availability saved (GEO-2937, GEO-2936).
 * Offline people are listed for them anyway (GEO-3154), so it says what hours do get them instead.
 */
export function SetAvailabilityNotice({
  message = 'Set your availability so others can schedule a debate with you, and to see which times you share.',
  surface = 'people_tab',
}: {
  message?: string;
  surface?: ScheduleEditorSurface;
} = {}) {
  const [open, setOpen] = React.useState(false);
  const { blocks, isError, refetch } = useDebateSchedule();
  const saveSchedule = useSaveDebateSchedule({ surface });
  const openerRef = React.useRef<HTMLElement | null>(null);

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-grey-01 p-3">
      <Text as="p" variant="footnote">
        {message}
      </Text>
      <HubPillButton
        analyticsLabel="Debate hub Set availability"
        analyticsIntent="open_debate_schedule"
        onClick={event => {
          openerRef.current = event.currentTarget;
          setOpen(true);
        }}
      >
        Set availability
      </HubPillButton>
      <AvailabilityModal
        open={open}
        onOpenChange={setOpen}
        blocks={blocks}
        error={isError}
        onRetry={() => refetch()}
        onSave={nextBlocks => saveSchedule.mutate(nextBlocks)}
        openerRef={openerRef}
      />
    </div>
  );
}
