'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import { localTimezone } from '~/core/availability/blocks';
import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { toDebatesPanel } from '~/core/debates/debates-panel-deep-link';
import { useMediaQuery } from '~/core/hooks/use-media-query';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { Input } from '~/design-system/input';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import { type DebatePerson, type SchedulablePerson, type ScheduledDebateRequest } from '../api';
import { useDebateActivity, useDebateSchedule, useGeoChatAuth } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
import { SpaceTopicFilters } from './claims-tab';
import { DebateHoursNote } from './debate-hours-note';
import { type ClaimMatch } from './disagreement-counts';
import { FilterSwitch } from './filter-switch';
import {
  type FindATimeFilter,
  type FindATimeOpenedFrom,
  findATimeFilterChanged,
  findATimeOpened,
  findATimeWeekChanged,
} from './find-a-time-analytics';
import { FindATimeDayList } from './find-a-time-day-list';
import {
  type CellPerson,
  FIND_A_TIME_WEEKS,
  type FreeSlot,
  SLOT_MS,
  freeSlotsByUser,
  ownDebates,
  viewerFreeSlots,
  weekCells,
  weekDays,
  weekRangeLabel,
  weekStart,
} from './find-a-time-model';
import { FIND_A_TIME_FROM_PARAM, safeReturnPath } from './find-a-time-route';
import { FindATimeWeek, FindATimeWeekSkeleton } from './find-a-time-week';
import { useDebatePeople, useDebateRequests, useSchedulablePeople } from './hooks';
import { HubHeaderControls } from './hub-header-controls';
import { HubPillButton } from './hub-pill-button';
import { HubMessage, isSignInRequired } from './hub-states';
import { PersonRow, type PersonSchedule, SetAvailabilityNotice } from './people-tab';
import { isExcludedFromPeopleTab } from './people-tab-exclusions';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { useLiveRequestBlock } from './use-live-request-block';
import { usePersonFacts } from './use-person-facts';
import { useSpaceFilterMenu } from './use-space-filter-selection';

const EMPTY_MATCHES: ClaimMatch[] = [];
const EMPTY_SPACE_IDS: string[] = [];
const EMPTY_MATCH_COUNTS = new Map<string, number>();
const EMPTY_REQUESTS: ScheduledDebateRequest[] = [];

/** Chips a row offers before "More times". */
const INLINE_SLOTS = 3;

/** Matches `md:` in styles.css: phones get the list by day instead of the grid. */
const PHONE_QUERY = '(max-width: 767px)';

/** An offline person in the roster's shape, as the People tab draws them (GEO-2937). */
function schedulableAsPerson({ user }: SchedulablePerson): DebatePerson {
  return {
    ...user,
    online: false,
    available_to_debate: false,
    in_debate: false,
    online_since: null,
    can_challenge: false,
  };
}

/** A row's chips: the given half-hours, and whether they have more beyond them. */
function chipsFor(slots: FreeSlot[], all: FreeSlot[] | undefined): PersonSchedule {
  return {
    slots: slots.slice(0, INLINE_SLOTS).map(slot => ({
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.start + SLOT_MS).toISOString(),
      viewerFree: slot.viewerFree,
    })),
    truncated: slots.length > INLINE_SLOTS || (all?.length ?? 0) > slots.length,
  };
}

type Booking = {
  userId: string;
  name: string;
  disagreementCount: number | null;
  initialStart?: string;
  entry: ScheduleEntry;
};

/**
 * Find a time to debate (GEO-3152): everyone's free time this week and next, as a week grid, so a
 * viewer can find someone to debate without setting a schedule of their own first.
 *
 * A view over the People tab's parts rather than a second implementation of them: the rows are
 * `PersonRow`, the ranking and spaces come from `usePersonFacts`, booking is the same modal with a
 * time picked, and Debate now is the same challenge. What is new is the grid, its cards and the
 * viewer's own debates drawn on it.
 */
export function FindATime() {
  const { authenticated, ready } = useGeoChatAuth();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'debate_matchmaking',
      auth_control: 'find_a_time',
      auth_continuation: 'repeat',
      auth_intent: 'start_debate',
    },
  });
  const searchParams = useSearchParams();
  const returnPath = safeReturnPath(searchParams?.get(FIND_A_TIME_FROM_PARAM) ?? null);
  const backHref = toDebatesPanel({ pathname: returnPath ?? undefined });
  const isPhone = useMediaQuery(PHONE_QUERY);

  const schedule = useDebateSchedule();
  const viewerHasSchedule = authenticated ? schedule.isSet : false;

  // Once per visit, when what it reports is known: signed out, or signed in with the viewer's own
  // schedule read. Fired before that, `viewer_has_schedule` would be a guess.
  const openedFrom: FindATimeOpenedFrom = returnPath ? 'hub' : 'direct';
  const reportedOpen = React.useRef(false);
  const scheduleSettled = !authenticated || schedule.data !== undefined || schedule.isError;
  React.useEffect(() => {
    if (!ready || !scheduleSettled || reportedOpen.current) return;
    reportedOpen.current = true;
    findATimeOpened({
      openedFrom,
      viewerHasSchedule: authenticated ? (schedule.isError ? null : schedule.isSet) : null,
    });
  }, [authenticated, openedFrom, ready, schedule.isError, schedule.isSet, scheduleSettled]);

  return (
    <div className="flex w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4 pb-2 md:px-4">
        <Link
          href={backHref}
          data-geo-analytics-label="Find a time Back to Debates"
          data-geo-analytics-intent="navigate_debates_hub"
          className="inline-flex items-center gap-1.5 text-metadataMedium text-grey-04 transition-colors hover:text-text"
        >
          <BackChevron />
          Back to Debates
        </Link>
        <HubHeaderControls />
      </header>

      <div className="flex flex-col gap-1 border-b border-grey-02 px-6 pb-3 md:px-4">
        <Text as="h1" variant="largeTitle" className="md:text-smallTitle">
          Find a time to debate
        </Text>
        <Text as="p" variant="metadata" color="grey-04">
          {viewerHasSchedule
            ? "Everyone's open times. Shaded hours are times you're free too."
            : "Everyone's open times. Click a time to book it."}
        </Text>
      </div>

      {!ready ? (
        <div className="px-6 py-6 md:px-4">
          <FindATimeWeekSkeleton />
        </div>
      ) : !authenticated ? (
        <HubMessage
          action={
            <HubPillButton variant="primary" onClick={() => promptSignIn()}>
              Sign in
            </HubPillButton>
          }
        >
          Sign in to see who&rsquo;s free to debate this week and book a time.
        </HubMessage>
      ) : (
        <FindATimeBody isPhone={isPhone} viewerHasSchedule={viewerHasSchedule} schedule={schedule} />
      )}
    </div>
  );
}

function FindATimeBody({
  isPhone,
  viewerHasSchedule,
  schedule,
}: {
  isPhone: boolean;
  viewerHasSchedule: boolean;
  schedule: ReturnType<typeof useDebateSchedule>;
}) {
  const peopleQuery = useDebatePeople(true);
  const { data: activity } = useDebateActivity(true);
  const { data: requests } = useDebateRequests(true);
  const scheduled = useScheduledDebates(true);
  const currentUserId = useCurrentGeoChatUserId();
  const { personalSpaceId } = usePersonalSpaceId();
  const popoverPortal = useElevatedPopoverPortal();

  // Held in state so slots that pass drop off as the page stays open; React Compiler caches a
  // `Date.now()` read in render once per mount.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [spaceIds, setSpaceIds] = React.useState<string[]>(EMPTY_SPACE_IDS);
  const [onlineOnly, setOnlineOnly] = React.useState(false);
  const [onlyViewerFree, setOnlyViewerFree] = React.useState(false);

  // The full list caps how many people it considers. Past the cap a space selection is sent to
  // geo-chat, which can reach the people the cap left out; below it, everyone is already in hand.
  const [capped, setCapped] = React.useState(false);
  const schedulableQuery = useSchedulablePeople(true, {
    full: true,
    spaces: capped ? spaceIds : EMPTY_SPACE_IDS,
  });
  const serverNarrowed = capped && spaceIds.length > 0;
  React.useEffect(() => {
    if (schedulableQuery.data && !serverNarrowed && !schedulableQuery.isPlaceholderData) {
      setCapped(schedulableQuery.data.truncated);
    }
  }, [schedulableQuery.data, schedulableQuery.isPlaceholderData, serverNarrowed]);

  const viewerKey = currentUserId ? normId(currentUserId) : null;
  const isViewer = React.useCallback(
    (person: Pick<DebatePerson, 'user_id' | 'profile_space_id'>) =>
      (viewerKey !== null && normId(person.user_id) === viewerKey) ||
      (personalSpaceId !== null && normId(person.profile_space_id) === normId(personalSpaceId)),
    [personalSpaceId, viewerKey]
  );

  // Online people keep their live row: available, away (GEO-3119) or in a debate. Everyone else
  // listed is drawn offline, the way the People tab draws them.
  const onlineByUser = React.useMemo(() => {
    const byUser = new Map<string, DebatePerson>();
    for (const person of peopleQuery.data?.people ?? []) {
      if (isExcludedFromPeopleTab(person.profile_space_id) || isViewer(person)) continue;
      byUser.set(normId(person.user_id), person);
    }
    return byUser;
  }, [isViewer, peopleQuery.data]);

  const slotsByUser = React.useMemo(
    () => (schedulableQuery.data ? freeSlotsByUser(schedulableQuery.data, now) : new Map<string, FreeSlot[]>()),
    [now, schedulableQuery.data]
  );

  const peopleByUser = React.useMemo(() => {
    const byUser = new Map<string, DebatePerson>(onlineByUser);
    for (const candidate of schedulableQuery.data?.people ?? []) {
      const key = normId(candidate.user.user_id);
      if (byUser.has(key) || isExcludedFromPeopleTab(candidate.user.profile_space_id)) continue;
      if (isViewer(candidate.user)) continue;
      byUser.set(key, schedulableAsPerson(candidate));
    }
    return byUser;
  }, [isViewer, onlineByUser, schedulableQuery.data]);
  const allPeople = React.useMemo(() => [...peopleByUser.values()], [peopleByUser]);

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
  } = usePersonFacts(allPeople, {
    authenticated: true,
    rosterUnavailable: peopleQuery.data === undefined || schedulableQuery.data === undefined,
  });
  const matchCount = React.useCallback(
    (person: DebatePerson) => matchAnalysis.byProfile.get(normId(person.profile_space_id))?.length ?? 0,
    [matchAnalysis]
  );

  // Search and online only narrow who is drawn; the space filter narrows it client-side unless the
  // server already did, in which case its membership answer stands.
  const searchTerm = search.trim().toLowerCase();
  const passesSearch = React.useCallback(
    (person: DebatePerson) => !searchTerm || speakerLabel(person).toLowerCase().includes(searchTerm),
    [searchTerm]
  );
  const effectiveSpaceIds = spaceActivityUnavailable && !serverNarrowed ? EMPTY_SPACE_IDS : spaceIds;
  const include = React.useCallback(
    (userKey: string) => {
      const person = peopleByUser.get(userKey);
      if (!person || !passesSearch(person)) return false;
      if (onlineOnly && !person.online) return false;
      if (effectiveSpaceIds.length > 0 && !serverNarrowed) {
        const theirs = debateSpacesByPerson.get(person.profile_space_id) ?? [];
        const wanted = new Set(effectiveSpaceIds.map(normId));
        if (!theirs.some(spaceId => wanted.has(spaceId))) return false;
      }
      return true;
    },
    [debateSpacesByPerson, effectiveSpaceIds, onlineOnly, passesSearch, peopleByUser, serverNarrowed]
  );

  // Most matches first, as the People tab orders people (GEO-3152 decision 8); then whoever can be
  // asked now, then whoever is free soonest, so rows keep still as data lands.
  const order = React.useCallback(
    (left: CellPerson, right: CellPerson) => {
      const a = peopleByUser.get(left.userKey);
      const b = peopleByUser.get(right.userKey);
      if (!a || !b) return 0;
      const live = (person: DebatePerson) => (person.online && !person.away && !person.in_debate ? 1 : 0);
      return (
        matchCount(b) - matchCount(a) ||
        live(b) - live(a) ||
        (left.slots[0]?.start ?? 0) - (right.slots[0]?.start ?? 0) ||
        speakerLabel(a).localeCompare(speakerLabel(b))
      );
    },
    [matchCount, peopleByUser]
  );

  // `now` moves every minute, but the viewer's own slots only need resolving once a day.
  const today = new Date(now).toDateString();
  const scheduleZone = schedule.data?.schedule.timezone;
  const viewerFree = React.useMemo(
    () => (viewerHasSchedule ? viewerFreeSlots(schedule.blocks, scheduleZone, new Date(today)) : new Set<number>()),
    [schedule.blocks, scheduleZone, today, viewerHasSchedule]
  );
  // The viewer's own free time is the one source for both the shading and "Only times I'm free",
  // so the two cannot disagree.
  const slotsWithViewer = React.useMemo(() => {
    if (!viewerHasSchedule) return slotsByUser;
    const flagged = new Map<string, FreeSlot[]>();
    for (const [key, slots] of slotsByUser) {
      flagged.set(
        key,
        slots.map(slot => ({ ...slot, viewerFree: viewerFree.has(slot.start) }))
      );
    }
    return flagged;
  }, [slotsByUser, viewerFree, viewerHasSchedule]);

  const days = React.useMemo(() => weekDays(weekStart(new Date(now), weekOffset)), [now, weekOffset]);
  const cells = React.useMemo(
    () => weekCells(slotsWithViewer, days, { include, onlyViewerFree: viewerHasSchedule && onlyViewerFree, order }),
    [days, include, onlyViewerFree, order, slotsWithViewer, viewerHasSchedule]
  );
  // Whether anyone at all is free this week, filters aside: the difference between "nobody is free"
  // and "your filters hid everyone", which have different ways forward.
  const unfilteredCells = React.useMemo(
    () => weekCells(slotsWithViewer, days, { include: () => true, onlyViewerFree: false, order }),
    [days, order, slotsWithViewer]
  );

  // Requests this page has just sent, until the list read returns them.
  const [justRequested, setJustRequested] = React.useState<ScheduledDebateRequest[]>(EMPTY_REQUESTS);
  const debates = React.useMemo(
    () => ownDebates(scheduled.data?.requests, justRequested, currentUserId).filter(debate => debate.end > now),
    [currentUserId, justRequested, now, scheduled.data]
  );
  const opponentIds = React.useMemo(
    () => debates.flatMap(debate => (debate.opponentUserId ? [debate.opponentUserId] : [])),
    [debates]
  );
  const opponentSummaries = useGeoChatUserSummaries(opponentIds, opponentIds.length > 0);
  const opponentName = React.useCallback(
    (userId: string | null) => {
      if (!userId) return null;
      const key = normId(userId);
      const known = peopleByUser.get(key) ?? opponentSummaries.find(summary => normId(summary.user_id) === key);
      return known ? speakerLabel(known) : null;
    },
    [opponentSummaries, peopleByUser]
  );

  const { outboundChallenge, blockedReason, buttonsDisabled } = useLiveRequestBlock(activity, requests);

  // Facets over everyone the other filters leave, as on the People tab.
  const offeredSpaces = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of allPeople) {
      if (!passesSearch(person) || !slotsByUser.has(normId(person.user_id))) continue;
      for (const spaceId of debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    // A space picked past the cap may have nobody left in hand to count; it stays offered.
    for (const spaceId of spaceIds) if (!counts.has(normId(spaceId))) counts.set(normId(spaceId), 0);
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [allPeople, debateSpacesByPerson, passesSearch, slotsByUser, spaceIds]);
  const changeFilter = (filter: FindATimeFilter) => findATimeFilterChanged(filter);
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds: next => {
      setSpaceIds(next);
      changeFilter('space');
    },
    memberSpaceIds: null,
    pending: peopleQuery.isLoading || spaceActivityUnavailable,
    seedSpent: true,
  });
  const { labelsById } = useSpaceLabels(
    React.useMemo(
      () => [...new Set([...facetSpaces.map(space => space.id), ...spaceIds, ...matchingSpaceIds])],
      [facetSpaces, matchingSpaceIds, spaceIds]
    )
  );

  // Search changes on every keystroke; one event per search, when it settles.
  const searchReported = React.useRef('');
  React.useEffect(() => {
    if (!searchTerm || searchReported.current === searchTerm) return;
    const timer = setTimeout(() => {
      searchReported.current = searchTerm;
      changeFilter('search');
    }, 1_000);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const [booking, setBooking] = React.useState<Booking | null>(null);
  const bookingOpenerRef = React.useRef<HTMLElement | null>(null);
  const openBooking = React.useCallback(
    (userKey: string, opener: HTMLElement | null, entry: ScheduleEntry, initialStart?: string) => {
      const person = peopleByUser.get(userKey);
      if (!person) return;
      bookingOpenerRef.current = opener;
      setBooking({
        userId: person.user_id,
        name: speakerLabel(person),
        disagreementCount: matchesKnown ? matchCount(person) : null,
        initialStart,
        entry,
      });
    },
    [matchCount, matchesKnown, peopleByUser]
  );

  /** One person's row, the People tab's, with the half-hours this place offers as its chips. */
  const renderRow = React.useCallback(
    (userKey: string, slots: FreeSlot[], entry: ScheduleEntry) => {
      const person = peopleByUser.get(userKey);
      if (!person) return null;
      const all = slotsByUser.get(userKey);
      const chips = slots.length > 0 ? chipsFor(slots, all) : undefined;
      const matches: ClaimMatch[] = matchAnalysis.byProfile.get(normId(person.profile_space_id)) ?? EMPTY_MATCHES;
      return (
        <PersonRow
          key={person.user_id}
          person={person}
          matches={matches}
          matchesBySpace={
            matchesKnown
              ? (matchAnalysis.countsByProfileAndSpace.get(normId(person.profile_space_id)) ?? EMPTY_MATCH_COUNTS)
              : undefined
          }
          claimNamesById={matchingClaimNamesById}
          claimNamesLoading={matchingClaimsLoading}
          schedule={person.online ? undefined : (chips ?? { slots: [], truncated: true })}
          times={person.online ? chips : undefined}
          entry={entry}
          canScheduleAway={Boolean(all && all.length > 0)}
          record={records.get(person.profile_space_id) ?? null}
          spaceIds={debateSpacesByPerson.get(person.profile_space_id) ?? EMPTY_SPACE_IDS}
          labelsById={labelsById}
          popoverPortal={popoverPortal}
          disabled={buttonsDisabled}
          disabledReason={blockedReason ?? 'You have a debate request awaiting a reply.'}
          onSeeTimes={(_peer, opener, rowEntry, initialStart) => openBooking(userKey, opener, rowEntry, initialStart)}
        />
      );
    },
    [
      blockedReason,
      buttonsDisabled,
      debateSpacesByPerson,
      labelsById,
      matchAnalysis,
      matchesKnown,
      matchingClaimNamesById,
      matchingClaimsLoading,
      openBooking,
      peopleByUser,
      popoverPortal,
      records,
      slotsByUser,
    ]
  );

  const goToWeek = (next: number, direction: 'previous' | 'next' | 'today') => {
    setWeekOffset(Math.max(0, Math.min(FIND_A_TIME_WEEKS - 1, next)));
    findATimeWeekChanged(direction);
  };
  const clearFilters = () => {
    setSearch('');
    setOnlineOnly(false);
    setOnlyViewerFree(false);
    onSpacesClear();
    changeFilter('clear');
  };

  const loading = schedulableQuery.isLoading || (peopleQuery.isLoading && !schedulableQuery.data);
  const loadError = schedulableQuery.error && !schedulableQuery.data ? schedulableQuery.error : null;
  const nobodyFree = unfilteredCells.size === 0;
  const filteredOut = !nobodyFree && cells.size === 0;
  const timezone = localTimezone();

  const state = loadError
    ? 'error'
    : loading
      ? 'loading'
      : nobodyFree && debates.every(debate => !inWeek(debate.start, days))
        ? 'nobody'
        : filteredOut && debates.every(debate => !inWeek(debate.start, days))
          ? 'filtered'
          : 'week';

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-grey-02 px-6 py-3 md:px-4">
        {outboundChallenge ? <DebateChallengeCard challenge={outboundChallenge} role="requester" /> : null}
        <SpaceTopicFilters
          analyticsSurface="hub"
          spaceIds={spaceIds}
          onSpaceToggle={onSpaceToggle}
          onSpacesClear={onSpacesClear}
          facetSpaces={facetSpaces}
          countsPending={peopleQuery.isLoading || publishableSpacesPending || personRecordsPending}
          leading={
            <div className="w-[260px] md:w-full">
              <Input
                withSearchIcon
                value={search}
                onChange={event => setSearch(event.currentTarget.value)}
                placeholder="Search people"
                aria-label="Search people"
              />
            </div>
          }
          trailing={
            <div className="flex flex-wrap items-center gap-4">
              {viewerHasSchedule ? (
                <FilterSwitch
                  label="Only times I'm free"
                  checked={onlyViewerFree}
                  onChange={next => {
                    setOnlyViewerFree(next);
                    changeFilter('only_viewer_free');
                  }}
                  analyticsSurface="hub"
                />
              ) : null}
              <FilterSwitch
                label="Online only"
                checked={onlineOnly}
                onChange={next => {
                  setOnlineOnly(next);
                  changeFilter('online_only');
                }}
                analyticsSurface="hub"
              />
            </div>
          }
        />
      </div>

      {!viewerHasSchedule && !schedule.isLoading ? (
        <div className="px-6 pt-3 md:px-4">
          <SetAvailabilityNotice
            message={
              isPhone
                ? 'Set your availability so others can book you too.'
                : 'Set your availability so others can book you too, and to see which of these times you share.'
            }
            surface="find_a_time"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-6 py-3 md:px-4">
        <HubPillButton
          aria-label="Previous week"
          analyticsLabel="Find a time Previous week"
          disabled={weekOffset === 0}
          onClick={() => goToWeek(weekOffset - 1, 'previous')}
          className="w-7 px-0"
        >
          ‹
        </HubPillButton>
        <HubPillButton
          aria-label="Next week"
          analyticsLabel="Find a time Next week"
          disabled={weekOffset >= FIND_A_TIME_WEEKS - 1}
          onClick={() => goToWeek(weekOffset + 1, 'next')}
          className="w-7 px-0"
        >
          ›
        </HubPillButton>
        <Text as="span" variant="listSemibold" className="px-1" aria-live="polite">
          {weekRangeLabel(days)}
        </Text>
        <HubPillButton
          analyticsLabel="Find a time Today"
          disabled={weekOffset === 0}
          onClick={() => goToWeek(0, 'today')}
        >
          Today
        </HubPillButton>
        <span className="flex-1" />
        <Legend viewerHasSchedule={viewerHasSchedule} />
        <Text as="span" variant="footnote" color="grey-04">
          {timezone === 'local' ? 'Your local time' : timezone}
        </Text>
      </div>

      {blockedReason ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
          {blockedReason}
        </Text>
      ) : null}
      {schedulableQuery.data?.truncated && !serverNarrowed ? (
        <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
          Showing the {schedulableQuery.data.people.length} people you have the most matches with. Narrow by space to
          see others.
        </Text>
      ) : null}
      <div className="px-6 pb-6 md:px-4">
        {state === 'error' ? (
          <HubMessage action={<HubPillButton onClick={() => void schedulableQuery.refetch()}>Try again</HubPillButton>}>
            {isSignInRequired(loadError) ? 'Sign in again to see who’s free.' : 'Couldn’t load who’s free.'}
          </HubMessage>
        ) : state === 'loading' ? (
          <FindATimeWeekSkeleton />
        ) : state === 'nobody' ? (
          <HubMessage
            note={<DebateHoursNote live />}
            action={
              weekOffset < FIND_A_TIME_WEEKS - 1 ? (
                <HubPillButton variant="primary" onClick={() => goToWeek(weekOffset + 1, 'next')}>
                  Next week
                </HubPillButton>
              ) : undefined
            }
          >
            Nobody has open times this week.
          </HubMessage>
        ) : state === 'filtered' ? (
          <HubMessage action={<HubPillButton onClick={clearFilters}>Clear filters</HubPillButton>}>
            Nobody who matches those filters is free this week.
          </HubMessage>
        ) : isPhone ? (
          <FindATimeDayList
            days={days}
            cells={cells}
            debates={debates}
            opponentName={opponentName}
            renderRow={renderRow}
          />
        ) : (
          <FindATimeWeek
            days={days}
            cells={cells}
            debates={debates}
            viewerFree={viewerHasSchedule ? viewerFree : null}
            peopleByUser={peopleByUser}
            slotsByUser={slotsByUser}
            opponentName={opponentName}
            renderRow={renderRow}
            onBook={openBooking}
            now={now}
          />
        )}
      </div>

      <PeerAvailabilityBookingModal
        open={booking !== null}
        userId={booking?.userId ?? ''}
        peerName={booking?.name}
        onClose={() => setBooking(null)}
        openerRef={bookingOpenerRef}
        initialSelectedStart={booking?.initialStart}
        entry={booking?.entry}
        disagreementCount={booking?.disagreementCount}
        onRequested={request =>
          setJustRequested(current => [...current.filter(item => item.request_id !== request.request_id), request])
        }
      />
    </div>
  );
}

function inWeek(at: number, days: Date[]) {
  return at >= days[0].getTime() && at < days[days.length - 1].getTime();
}

function Legend({ viewerHasSchedule }: { viewerHasSchedule: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-3 text-footnote text-grey-04" aria-label="Legend">
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2 w-2 rounded-full bg-green" />
        Online now
      </li>
      {viewerHasSchedule ? (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-3.5 rounded-sm bg-green/10 ring-1 ring-green/30 ring-inset" />
          You&rsquo;re free
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-3.5 rounded-sm bg-text" />
        Booked
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-2.5 w-3.5 rounded-sm border border-dashed border-text" />
        Requested
      </li>
    </ul>
  );
}

function BackChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
