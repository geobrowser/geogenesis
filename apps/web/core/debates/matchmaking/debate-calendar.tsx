'use client';

import * as React from 'react';

import { useSearchParams } from 'next/navigation';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { safeInternalHref } from '~/core/debates/debate-return-navigation';
import { useMediaQuery } from '~/core/hooks/use-media-query';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import { type DebatePerson, type ScheduledDebateRequest } from '../api';
import { useDebateActivity, useDebateSchedule, useGeoChatAuth } from '../hooks';
import { speakerLabel } from '../playback-utils';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { DebateChallengeCard } from './challenge-card';
import {
  type CalendarFilter,
  type CalendarOpenedFrom,
  calendarFilterChanged,
  calendarOpened,
  calendarWeekChanged,
} from './debate-calendar-analytics';
import { CalendarDayList } from './debate-calendar-day-list';
import {
  CALENDAR_WEEKS,
  type CellPerson,
  type FreeSlot,
  SLOT_MS,
  cellOf,
  freeSlotsByUser,
  ownDebates,
  viewerFreeCellKeys,
  viewerFreeSlots,
  weekCells,
  weekDays,
  weekOffsetLabels,
  weekRangeLabel,
  weekStart,
} from './debate-calendar-model';
import { CALENDAR_FROM_PARAM } from './debate-calendar-route';
import { CalendarWeek, CalendarWeekSkeleton } from './debate-calendar-week';
import { DebateHoursNote } from './debate-hours-note';
import { type ClaimMatch } from './disagreement-counts';
import { useDebatePeople, useDebateRequests, useSchedulablePeople } from './hooks';
import { HubHeaderControls } from './hub-header-controls';
import { HubPillButton } from './hub-pill-button';
import { HubMessage, HubQueryState } from './hub-states';
import { INLINE_SLOTS, PersonRow, type PersonSchedule, SetAvailabilityNotice, schedulableAsPerson } from './people-tab';
import { isExcludedFromPeopleTab } from './people-tab-exclusions';
import { SpaceFilterPills } from './space-filter-pills';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { useLiveRequestBlock } from './use-live-request-block';
import { usePersonFacts } from './use-person-facts';
import { useSpaceFilterMenu } from './use-space-filter-selection';

const EMPTY_MATCHES: ClaimMatch[] = [];
const EMPTY_SPACE_IDS: string[] = [];
const EMPTY_MATCH_COUNTS = new Map<string, number>();
const EMPTY_REQUESTS: ScheduledDebateRequest[] = [];

/** Matches `md:` in styles.css: phones get the list by day instead of the grid. */
const PHONE_QUERY = '(max-width: 767px)';

/**
 * A row's chips: the given half-hours, and whether they have more beyond them. `viewerIsFree` only
 * for a viewer with hours, as on the People tab: without them every chip stays plain.
 */
function chipsFor(slots: FreeSlot[], all: FreeSlot[] | undefined, viewerHasSchedule: boolean): PersonSchedule {
  return {
    slots: slots.slice(0, INLINE_SLOTS).map(slot => ({
      start: new Date(slot.start).toISOString(),
      end: new Date(slot.start + SLOT_MS).toISOString(),
      viewerIsFree: viewerHasSchedule ? slot.viewerFree : undefined,
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
 * The debate calendar (GEO-3152): everyone's free time this week and next, as a week grid, so a
 * viewer can find someone to debate without setting a schedule of their own first.
 *
 * A view over the People tab's parts rather than a second implementation of them: the rows are
 * `PersonRow`, the ranking and spaces come from `usePersonFacts`, booking is the same modal with a
 * time picked, and Debate now is the same challenge. What is new is the grid, its cards and the
 * viewer's own debates drawn on it.
 */
export function DebateCalendar() {
  const { authenticated, ready } = useGeoChatAuth();
  const promptSignIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'debate_matchmaking',
      auth_control: 'calendar',
      auth_continuation: 'repeat',
      auth_intent: 'start_debate',
    },
  });
  const searchParams = useSearchParams();
  const from = searchParams?.get(CALENDAR_FROM_PARAM);
  const returnPath = from ? safeInternalHref(from) : null;
  const isPhone = useMediaQuery(PHONE_QUERY);

  const schedule = useDebateSchedule();
  const viewerHasSchedule = authenticated ? schedule.isSet : false;

  // Once per visit, when what it reports is known: signed out, or signed in with the viewer's own
  // schedule read. Fired before that, `viewer_has_schedule` would be a guess.
  const openedFrom: CalendarOpenedFrom = returnPath ? 'hub' : 'direct';
  const reportedOpen = React.useRef(false);
  const scheduleSettled = !authenticated || schedule.data !== undefined || schedule.isError;
  React.useEffect(() => {
    if (!ready || !scheduleSettled || reportedOpen.current) return;
    reportedOpen.current = true;
    calendarOpened({
      openedFrom,
      viewerHasSchedule: authenticated ? (schedule.isError ? null : schedule.isSet) : null,
    });
  }, [authenticated, openedFrom, ready, schedule.isError, schedule.isSet, scheduleSettled]);

  return (
    <div className="flex w-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-grey-02 px-6 pt-4 pb-3 md:px-4">
        <Text as="h1" variant="largeTitle" className="md:text-smallTitle">
          Debate calendar
        </Text>
        <HubHeaderControls analyticsSurface="calendar" />
      </header>

      {!ready ? (
        <div className="px-6 py-6 md:px-4">
          <CalendarWeekSkeleton />
        </div>
      ) : !authenticated ? (
        <HubMessage
          action={
            <HubPillButton analyticsSurface="calendar" variant="primary" onClick={() => promptSignIn()}>
              Sign in
            </HubPillButton>
          }
        >
          Sign in to see who&rsquo;s free to debate this week and book a time.
        </HubMessage>
      ) : (
        <DebateCalendarBody isPhone={isPhone} viewerHasSchedule={viewerHasSchedule} schedule={schedule} />
      )}
    </div>
  );
}

function DebateCalendarBody({
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

  // The full list caps how many people it considers. Past the cap a space selection is sent to
  // geo-chat, which can reach the people the cap left out; below it, everyone is already in hand.
  const [capped, setCapped] = React.useState(false);
  const schedulableQuery = useSchedulablePeople(true, {
    calendar: true,
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

  // Search narrows who is drawn; the space filter narrows it client-side unless the
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
      if (effectiveSpaceIds.length > 0 && !serverNarrowed) {
        const theirs = debateSpacesByPerson.get(person.profile_space_id) ?? [];
        const wanted = new Set(effectiveSpaceIds.map(normId));
        if (!theirs.some(spaceId => wanted.has(spaceId))) return false;
      }
      return true;
    },
    [debateSpacesByPerson, effectiveSpaceIds, passesSearch, peopleByUser, serverNarrowed]
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
  // The viewer's own free time is the one source for both the shading and the green chips, so the
  // two cannot disagree.
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
  const viewerFreeCells = React.useMemo(() => viewerFreeCellKeys(viewerFree, days), [days, viewerFree]);
  const cells = React.useMemo(
    () => weekCells(slotsWithViewer, days, { include, order }),
    [days, include, order, slotsWithViewer]
  );
  // Whether anyone at all is free this week, filters aside: the difference between "nobody is free"
  // and "your filters hid everyone", which have different ways forward.
  const unfilteredCells = React.useMemo(
    // Everyone the calendar can draw, which is not everyone geo-chat listed: the viewer and the
    // People tab's exclusions are never drawn, so their free time cannot make an empty week look
    // like the filters' doing.
    () => weekCells(slotsWithViewer, days, { include: key => peopleByUser.has(key), order }),
    [days, order, peopleByUser, slotsWithViewer]
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
  const changeFilter = (filter: CalendarFilter) => calendarFilterChanged(filter);
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    // The plain setter: the menu also writes the selection itself, and those writes are not the
    // viewer changing a filter. The viewer's own presses are recorded where they happen, below.
    setSpaceIds,
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
    // Cleared, it forgets what it reported: the same words typed again later are a new search.
    if (!searchTerm) {
      searchReported.current = '';
      return;
    }
    if (searchReported.current === searchTerm) return;
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
      const chips = slots.length > 0 ? chipsFor(slots, all, viewerHasSchedule) : undefined;
      const matches: ClaimMatch[] = matchAnalysis.byProfile.get(normId(person.profile_space_id)) ?? EMPTY_MATCHES;
      return (
        <PersonRow
          key={person.user_id}
          analyticsSurface="calendar"
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
      viewerHasSchedule,
    ]
  );

  const goToWeek = (next: number, direction: 'previous' | 'next' | 'today') => {
    setWeekOffset(Math.max(0, Math.min(CALENDAR_WEEKS - 1, next)));
    calendarWeekChanged(direction);
  };
  const clearFilters = () => {
    setSearch('');
    onSpacesClear();
    changeFilter('clear');
  };

  const loading = schedulableQuery.isLoading || (peopleQuery.isLoading && !schedulableQuery.data);
  const loadError = schedulableQuery.error && !schedulableQuery.data ? schedulableQuery.error : null;
  const nobodyFree = unfilteredCells.size === 0;
  const filteredOut = !nobodyFree && cells.size === 0;
  const offsets = weekOffsetLabels(days);

  // The viewer's own debates keep the week on screen even with nobody else free in it.
  const ownDebatesThisWeek = debates.some(debate => cellOf(debate.start, days) !== null);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-grey-02 px-6 py-3 md:px-4">
        {outboundChallenge ? (
          <DebateChallengeCard challenge={outboundChallenge} role="requester" analyticsSurface="calendar" />
        ) : null}
        {/* Pills on the left, search on the right. On a phone the search goes on top, full width,
            and the pills scroll sideways under it. */}
        <div className="flex items-center gap-3 md:flex-col-reverse md:items-stretch">
          <SpaceFilterPills
            className="min-w-0 flex-1"
            analyticsSurface="calendar"
            facetSpaces={facetSpaces}
            spaceIds={spaceIds}
            onSpaceToggle={spaceId => {
              onSpaceToggle(spaceId);
              changeFilter('space');
            }}
            onSpacesClear={() => {
              onSpacesClear();
              changeFilter('space');
            }}
            loading={peopleQuery.isLoading || publishableSpacesPending}
            countsPending={peopleQuery.isLoading || publishableSpacesPending || personRecordsPending}
          />
          <div className="w-[260px] shrink-0 md:w-full">
            <Input
              withSearchIcon
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              placeholder="Search people"
              aria-label="Search people"
            />
          </div>
        </div>
      </div>

      {!viewerHasSchedule && !schedule.isLoading ? (
        <div className="px-6 pt-3 md:px-4">
          <SetAvailabilityNotice
            message={
              isPhone
                ? 'Set your availability so others can book you too.'
                : 'Set your availability so others can book you too, and to see which of these times you share.'
            }
            surface="calendar"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-6 py-3 md:px-4">
        <HubPillButton
          aria-label="Previous week"
          analyticsSurface="calendar"
          analyticsLabel="Debate calendar Previous week"
          disabled={weekOffset === 0}
          onClick={() => goToWeek(weekOffset - 1, 'previous')}
          className="w-7 px-0"
        >
          ‹
        </HubPillButton>
        <HubPillButton
          aria-label="Next week"
          analyticsSurface="calendar"
          analyticsLabel="Debate calendar Next week"
          disabled={weekOffset >= CALENDAR_WEEKS - 1}
          onClick={() => goToWeek(weekOffset + 1, 'next')}
          className="w-7 px-0"
        >
          ›
        </HubPillButton>
        <Text as="span" variant="listSemibold" className="px-1" aria-live="polite">
          {weekRangeLabel(days)}
        </Text>
        <HubPillButton analyticsSurface="calendar" disabled={weekOffset === 0} onClick={() => goToWeek(0, 'today')}>
          Today
        </HubPillButton>
        <span className="flex-1" />
        <Legend viewerHasSchedule={viewerHasSchedule} />
        {/* The week grid carries the offset at the top of its time column; the day list has no
            time column, so a phone shows it here. */}
        {isPhone ? (
          <Text as="span" variant="footnote" color="grey-04">
            {offsets.join(' / ')}
          </Text>
        ) : null}
      </div>

      {/* Not the error state: everyone's free time loaded and can still be booked. These are the
          reads that only add to it, so a failure says what is missing and the week stays up. */}
      {peopleQuery.error ? (
        <PartialLoadNote onRetry={() => void peopleQuery.refetch()}>
          Couldn&rsquo;t load who&rsquo;s online, so everyone shows as offline.
        </PartialLoadNote>
      ) : null}
      {scheduled.error ? (
        <PartialLoadNote onRetry={() => void scheduled.refetch()}>
          Couldn&rsquo;t load your own debates, so they&rsquo;re missing from the week.
        </PartialLoadNote>
      ) : null}
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
        <HubQueryState
          analyticsSurface="calendar"
          isLoading={loading}
          loadingFallback={<CalendarWeekSkeleton />}
          error={loadError}
          failureReason={schedulableQuery.failureReason}
          onRetry={() => void schedulableQuery.refetch()}
          isEmpty={(nobodyFree || filteredOut) && !ownDebatesThisWeek}
          // Filters hiding everyone has an undo; nobody being free this week has somewhere to go.
          emptyMessage={
            filteredOut ? 'Nobody who matches those filters is free this week.' : 'Nobody has open times this week.'
          }
          emptyNote={filteredOut ? undefined : <DebateHoursNote live />}
          emptyAction={
            filteredOut
              ? { label: 'Clear filters', onClick: clearFilters }
              : weekOffset < CALENDAR_WEEKS - 1
                ? { label: 'Next week', onClick: () => goToWeek(weekOffset + 1, 'next') }
                : undefined
          }
        >
          {isPhone ? (
            <CalendarDayList
              days={days}
              cells={cells}
              debates={debates}
              opponentName={opponentName}
              renderRow={renderRow}
            />
          ) : (
            <CalendarWeek
              // A week of its own: the open hour, the card and its timer, and the focused cell all
              // belong to the week they were opened on, so moving weeks starts them afresh.
              key={days[0].getTime()}
              days={days}
              cells={cells}
              debates={debates}
              viewerFreeCells={viewerHasSchedule ? viewerFreeCells : null}
              peopleByUser={peopleByUser}
              slotsByUser={slotsByUser}
              opponentName={opponentName}
              renderRow={renderRow}
              onBook={openBooking}
              now={now}
            />
          )}
        </HubQueryState>
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

function PartialLoadNote({ children, onRetry }: { children: React.ReactNode; onRetry: () => void }) {
  return (
    <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
      {children}{' '}
      <button type="button" className="underline" onClick={onRetry}>
        Retry
      </button>
    </Text>
  );
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
