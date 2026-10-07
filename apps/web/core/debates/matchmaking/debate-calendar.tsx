'use client';

import * as React from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { ScheduleEntry } from '~/core/availability/schedule-analytics';
import { safeInternalHref } from '~/core/debates/debate-return-navigation';
import { useMediaQuery } from '~/core/hooks/use-media-query';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { Text } from '~/design-system/text';
import { useElevatedPopoverPortal } from '~/design-system/use-elevated-popover-portal';

import { PeerAvailabilityBookingModal } from '~/partials/availability/peer-availability-booking-modal';

import { type DebatePerson, type ScheduledDebateRequest } from '../api';
import { useClaimEntitiesByIds } from '../claim-picker-page';
import { useDebateActivity, useDebateSchedule, useGeoChatAuth } from '../hooks';
import { useParticipantPositions } from '../participant-positions';
import { speakerLabel } from '../playback-utils';
import { useAdminScheduledDebates, useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { AdminDebatesBody, type CalendarView, CalendarViewSwitch } from './admin-debate-calendar';
import {
  CalendarNarrowPanelBody,
  CalendarNarrowPills,
  CalendarNarrowSheet,
  type ClaimOpponent,
  type NarrowTab,
  type PanelClaim,
  type PanelPerson,
} from './calendar-narrow-panel';
import {
  type CalendarPicks,
  NO_PICKS,
  type PanelTopic,
  claimListRows,
  hasPicks,
  hiddenPicksSentence,
  narrowingSentence,
  passesPicks,
  personListRows,
  splitClaimPickKey,
  summarizeClaims,
  withoutDeadMatchesOnly,
} from './calendar-narrowing';
import { DebateChallengeCard } from './challenge-card';
import { SpaceTopicFilters } from './claims-tab';
import {
  type CalendarFilter,
  type CalendarOpenedFrom,
  calendarFilterChanged,
  calendarOpened,
  calendarWeekChanged,
} from './debate-calendar-analytics';
import { CalendarWeekNav, useMinuteClock } from './debate-calendar-controls';
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
  weekStart,
} from './debate-calendar-model';
import {
  CALENDAR_FROM_PARAM,
  CALENDAR_PATH,
  CALENDAR_VIEW_PARAM,
  readCalendarPicks,
  writeCalendarPicks,
} from './debate-calendar-route';
import { CalendarWeek, CalendarWeekSkeleton } from './debate-calendar-week';
import { DebateHoursNote } from './debate-hours-note';
import { type ClaimMatch } from './disagreement-counts';
import { useDebatePeople, useDebateRequests, useSchedulablePeople } from './hooks';
import { debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { HubHeaderControls } from './hub-header-controls';
import { HubPillButton } from './hub-pill-button';
import { HubMessage, HubQueryState } from './hub-states';
import { INLINE_SLOTS, PersonRow, type PersonSchedule, SetAvailabilityNotice, schedulableAsPerson } from './people-tab';
import { isExcludedFromPeopleTab } from './people-tab-exclusions';
import { claimName } from './person-disagreements';
import { isPersonId } from './person-records-document';
import { SpaceFilterPills } from './space-filter-pills';
import { claimTopicsById, topicsFor } from './topic-facets';
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
  const router = useRouter();
  const pathname = usePathname();
  const from = searchParams?.get(CALENDAR_FROM_PARAM);
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Admins get a second view, of everyone's scheduled debates (GEO-2943). The admin list is also the
  // admin check, so it is read for every signed-in viewer and refused for all but the allowlist.
  // From the start of this week, once per visit: the week moving under an open page is not worth a
  // second key.
  const [adminFrom] = React.useState(() => weekStart(new Date(), 0));
  const admin = useAdminScheduledDebates(authenticated, adminFrom);
  const requestedView: CalendarView = searchParams?.get(CALENDAR_VIEW_PARAM) === 'debates' ? 'debates' : 'availability';
  const view: CalendarView = admin.isAdmin ? requestedView : 'availability';
  const changeView = (next: CalendarView) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (next === 'debates') params.set(CALENDAR_VIEW_PARAM, next);
    else params.delete(CALENDAR_VIEW_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : (pathname ?? CALENDAR_PATH), { scroll: false });
  };

  const schedule = useDebateSchedule();
  const viewerHasSchedule = authenticated ? schedule.isSet : false;

  // Once per visit, when what it reports is known: signed out, or signed in with the viewer's own
  // schedule read. Fired before that, `viewer_has_schedule` would be a guess.
  const openedFrom: CalendarOpenedFrom = from && safeInternalHref(from) ? 'hub' : 'direct';
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
        <HubHeaderControls analyticsSurface="calendar">
          {admin.isAdmin ? <CalendarViewSwitch view={view} onChange={changeView} /> : null}
        </HubHeaderControls>
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
      ) : requestedView === 'debates' && admin.isAdminPending ? (
        // A link to the admin view waits to learn whether it may open, rather than flashing the other.
        <div className="px-6 py-6 md:px-4">
          <CalendarWeekSkeleton />
        </div>
      ) : view === 'debates' ? (
        <AdminDebatesBody isPhone={isPhone} admin={admin} />
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
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
  const popoverPortal = useElevatedPopoverPortal();

  const now = useMinuteClock();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [spaceIds, setSpaceIds] = React.useState<string[]>(EMPTY_SPACE_IDS);

  // The panel's picks live in the URL (GEO-3220), so a narrowed week survives a reload and can be
  // shared. The URL is the only copy: every write goes through it and every read comes from it.
  const picks = React.useMemo(() => readCalendarPicks(searchParams), [searchParams]);
  const setPicks = React.useCallback(
    (next: CalendarPicks) => {
      const params = writeCalendarPicks(new URLSearchParams(searchParams?.toString()), next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : (pathname ?? CALENDAR_PATH), { scroll: false });
    },
    [pathname, router, searchParams]
  );
  const [panelTab, setPanelTab] = React.useState<NarrowTab | null>(null);
  // Everyone's positions are read the first time the panel opens, not on page load: the calendar
  // with nothing picked needs only the viewer's own claims. A link that arrives with a claim picked
  // needs them from the start.
  const [panelOpened, setPanelOpened] = React.useState(false);
  const wantAllPositions = panelOpened || picks.claims.length > 0;

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
    viewerHasPositions,
    matchesLoading,
    matchesUnavailable,
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

  const profileMatchCount = React.useCallback(
    (profileKey: string) => matchAnalysis.byProfile.get(profileKey)?.length ?? 0,
    [matchAnalysis]
  );
  const matchCount = React.useCallback(
    (person: DebatePerson) => profileMatchCount(normId(person.profile_space_id)),
    [profileMatchCount]
  );

  // Everyone's positions, for the Claims tab and for claim picks: who holds which claim, on which
  // side. The People tab's read above only knows the claims the viewer answered.
  const viewerProfileSpaceId = personalSpaceId && isPersonId(personalSpaceId) ? personalSpaceId : null;
  // The roster's positions whether or not the viewer has a personal space of their own: someone
  // still setting one up can pick a claim and see who holds it, just not who opposes them.
  const allPositionParticipants = React.useMemo(
    () =>
      wantAllPositions
        ? [
            ...(viewerProfileSpaceId ? [{ profile_space_id: viewerProfileSpaceId }] : []),
            ...allPeople.flatMap(person =>
              isPersonId(person.profile_space_id) ? [{ profile_space_id: person.profile_space_id }] : []
            ),
          ]
        : [],
    [allPeople, viewerProfileSpaceId, wantAllPositions]
  );
  const allPositions = useParticipantPositions(allPositionParticipants, viewerProfileSpaceId);
  /**
   * Where everyone's positions stand, for anything that narrows on them.
   *
   * `ready` once a first answer has landed, and not again after: the read is keyed on everyone on
   * the calendar, online people included, and that list is polled, so the key moves whenever someone
   * comes or goes. Waiting on `isPlaceholderData` too sent the week back to its skeleton on every such
   * change (GEO-3220 review: "two cycles of the calendar reloading"); the held answer is drawn instead.
   *
   * `failed` is a read that errored with nothing in hand, which is not an answer of "nobody holds
   * it": the picks it would judge are set aside and the page says so, while the read's poll retries.
   * An empty roster, once it has loaded, is an answer.
   */
  const allPositionsState: 'idle' | 'pending' | 'ready' | 'failed' = !wantAllPositions
    ? 'idle'
    : personalSpaceLoading
      ? 'pending'
      : allPositionParticipants.length === 0
        ? schedulableQuery.data === undefined
          ? 'pending'
          : 'ready'
        : allPositions.isLoading
          ? 'pending'
          : allPositions.error !== null && allPositions.byClaim.size === 0
            ? 'failed'
            : 'ready';
  const allPositionsReady = allPositionsState === 'ready';
  const pool = React.useMemo(() => new Set(allPeople.map(person => normId(person.profile_space_id))), [allPeople]);
  const claimSummaries = React.useMemo(
    () => summarizeClaims(allPositions.byClaim, viewerProfileSpaceId, pool),
    [allPositions.byClaim, pool, viewerProfileSpaceId]
  );

  /** Matches only stays off for a viewer with no positions, on the page and in a phone's draft. */
  const guardPicks = React.useCallback(
    (withPicks: CalendarPicks) => withoutDeadMatchesOnly(withPicks, viewerHasPositions),
    [viewerHasPositions]
  );
  const effectivePicks = React.useMemo(() => guardPicks(picks), [guardPicks, picks]);
  /**
   * The picks as far as the data in hand can judge them. A read that failed leaves its picks unjudged
   * rather than judging them against nothing — which hid everyone. The panel still shows them ticked.
   */
  const judgeable = React.useCallback(
    (withPicks: CalendarPicks): CalendarPicks => {
      const claims = allPositionsState === 'failed' ? [] : withPicks.claims;
      const matchesOnly = withPicks.matchesOnly && !(matchesUnavailable && claims.length === 0);
      return claims === withPicks.claims && matchesOnly === withPicks.matchesOnly
        ? withPicks
        : { ...withPicks, claims, matchesOnly };
    },
    [allPositionsState, matchesUnavailable]
  );
  const judgedPicks = React.useMemo(() => judgeable(effectivePicks), [effectivePicks, judgeable]);
  // A pick the data to judge it has not arrived for yet: the week waits rather than drawing people
  // the pick is about to hide.
  const picksPending =
    (judgedPicks.claims.length > 0 && allPositionsState === 'pending') ||
    (judgedPicks.matchesOnly && judgedPicks.claims.length === 0 && matchesLoading);

  // The space filter narrows client-side unless the server already did, in which case its
  // membership answer stands.
  const effectiveSpaceIds = spaceActivityUnavailable && !serverNarrowed ? EMPTY_SPACE_IDS : spaceIds;
  const inSpaces = React.useCallback(
    (person: DebatePerson) => {
      if (effectiveSpaceIds.length === 0 || serverNarrowed) return true;
      const theirs = debateSpacesByPerson.get(person.profile_space_id) ?? [];
      const wanted = new Set(effectiveSpaceIds.map(normId));
      return theirs.some(spaceId => wanted.has(spaceId));
    },
    [debateSpacesByPerson, effectiveSpaceIds, serverNarrowed]
  );
  const includeWith = React.useCallback(
    (withPicks: CalendarPicks) => (userKey: string) => {
      const person = peopleByUser.get(userKey);
      if (!person || !inSpaces(person)) return false;
      return passesPicks(normId(person.profile_space_id), judgeable(withPicks), claimSummaries, profileMatchCount);
    },
    [claimSummaries, inSpaces, judgeable, peopleByUser, profileMatchCount]
  );
  const include = React.useMemo(() => includeWith(effectivePicks), [effectivePicks, includeWith]);

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
      if (!slotsByUser.has(normId(person.user_id))) continue;
      for (const spaceId of debateSpacesByPerson.get(person.profile_space_id) ?? []) {
        counts.set(spaceId, (counts.get(spaceId) ?? 0) + 1);
      }
    }
    // A space picked past the cap may have nobody left in hand to count; it stays offered.
    for (const spaceId of spaceIds) if (!counts.has(normId(spaceId))) counts.set(normId(spaceId), 0);
    return [...counts].map(([id, count]) => ({ id, name: null, count }));
  }, [allPeople, debateSpacesByPerson, slotsByUser, spaceIds]);
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

  /**
   * One person's row, the People tab's, with the half-hours this place offers as its chips. The
   * People panel adds a checkbox, and a portal of its own inside a phone's sheet.
   */
  const renderRow = React.useCallback(
    (
      userKey: string,
      slots: FreeSlot[],
      entry: ScheduleEntry,
      options?: { pick?: { selected: boolean; hidden: boolean; onToggle: () => void }; portal?: HTMLElement | null }
    ) => {
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
          popoverPortal={options?.portal === undefined ? popoverPortal : options.portal}
          pick={options?.pick}
          // The calendar is the work: a name opens the profile beside it rather than leaving it.
          openProfileInSidePanel
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
    onSpacesClear();
    setPicks(NO_PICKS);
    changeFilter('clear');
  };
  /** One event per change, naming which kind of pick it was. */
  const changePicks = (next: CalendarPicks) => {
    if (next.matchesOnly !== picks.matchesOnly) changeFilter('matches_only');
    else if (next.claims.join() !== picks.claims.join()) changeFilter('claim');
    else if (next.people.join() !== picks.people.join()) changeFilter('person');
    setPicks(next);
  };
  const togglePanel = (tab: NarrowTab) => {
    setPanelOpened(true);
    setPanelTab(current => (current === tab ? null : tab));
  };

  // What the panel's lists need, over everyone the calendar knows of.
  const profileToUser = React.useMemo(() => {
    const byProfile = new Map<string, { userKey: string; person: DebatePerson }>();
    for (const [userKey, person] of peopleByUser) byProfile.set(normId(person.profile_space_id), { userKey, person });
    return byProfile;
  }, [peopleByUser]);
  const panelClaimIds = React.useMemo(() => {
    if (!wantAllPositions) return EMPTY_SPACE_IDS;
    const ids = new Set([...claimSummaries.byKey.values()].map(summary => normId(summary.claimId)));
    for (const key of picks.claims) {
      const pick = splitClaimPickKey(key);
      if (pick) ids.add(pick.claimId);
    }
    return [...ids].sort();
  }, [claimSummaries, picks.claims, wantAllPositions]);
  const { entities: panelClaimEntities, isLoading: panelClaimEntitiesLoading } = useClaimEntitiesByIds(panelClaimIds);
  const panelClaimNames = React.useMemo(
    () => new Map(panelClaimEntities.map(claim => [normId(claim.id), claim.name])),
    [panelClaimEntities]
  );
  // Each claim's topics in its own space, for the panel's topic menus. People carry no topics, so
  // the People tab reads them through the claims each person holds.
  const claimTopics = React.useMemo(() => {
    const byClaimId = claimTopicsById(panelClaimEntities);
    const byKey = new Map<string, PanelTopic[]>();
    for (const summary of claimSummaries.byKey.values()) {
      const topics = topicsFor(byClaimId, summary.claimId, summary.spaceId);
      if (topics) byKey.set(summary.key, topics);
    }
    return byKey;
  }, [claimSummaries, panelClaimEntities]);
  const personFacts = React.useMemo(
    () =>
      allPeople.map(person => {
        const profileKey = normId(person.profile_space_id);
        return {
          profileKey,
          matchCount: profileMatchCount(profileKey),
          firstFree: slotsByUser.get(normId(person.user_id))?.[0]?.start ?? null,
          inSpaces: inSpaces(person),
          person,
          matches: matchAnalysis.byProfile.get(profileKey) ?? EMPTY_MATCHES,
        };
      }),
    [allPeople, inSpaces, matchAnalysis, profileMatchCount, slotsByUser]
  );
  const panelRowsFor = React.useCallback(
    (withPicks: CalendarPicks): { claims: PanelClaim[]; people: PanelPerson[] } => {
      const guarded = guardPicks(withPicks);
      const opponentsOf = (profileKeys: ReadonlySet<string>): ClaimOpponent[] =>
        [...profileKeys]
          .flatMap(profileKey => {
            const known = profileToUser.get(profileKey);
            return known ? [{ ...known, slots: slotsByUser.get(known.userKey) ?? [] }] : [];
          })
          .sort((left, right) => (left.slots[0]?.start ?? Infinity) - (right.slots[0]?.start ?? Infinity));
      return {
        claims: claimListRows(claimSummaries, guarded, spaceIds).map(row => ({
          ...row,
          name: claimName(row.summary.claimId, panelClaimNames, panelClaimEntitiesLoading),
          opponents: opponentsOf(row.summary.opponents),
        })),
        people: personListRows(personFacts, guarded, claimSummaries),
      };
    },
    [
      claimSummaries,
      guardPicks,
      panelClaimEntitiesLoading,
      panelClaimNames,
      personFacts,
      profileToUser,
      slotsByUser,
      spaceIds,
    ]
  );
  const panelRows = React.useMemo(() => panelRowsFor(picks), [panelRowsFor, picks]);

  // Who the week draws, and how many a phone's draft would.
  const drawnUsers = React.useMemo(() => {
    const users = new Set<string>();
    for (const people of cells.values()) for (const person of people) users.add(person.userKey);
    return users;
  }, [cells]);
  // The calendar holds two weeks. Picks often fit only the other one — late in a week most people's
  // next free time is next week — so what the other week holds is worth knowing on this one.
  const otherWeekOffset = weekOffset === 0 ? 1 : 0;
  const weekLabel = (offset: number) => (offset === 0 ? 'this week' : 'next week');
  // Each week's bounds, worked out once a minute rather than once per person asked about.
  const weekRanges = React.useMemo(
    () =>
      Array.from({ length: CALENDAR_WEEKS }, (_, offset) => {
        const bounds = weekDays(weekStart(new Date(now), offset));
        return [bounds[0].getTime(), bounds[bounds.length - 1].getTime()] as const;
      }),
    [now]
  );
  const freeInWeek = React.useCallback(
    (userKey: string, offset: number) => {
      const [start, end] = weekRanges[offset];
      return (slotsByUser.get(userKey) ?? []).some(slot => slot.start >= start && slot.start < end);
    },
    [slotsByUser, weekRanges]
  );
  const freeThisWeek = React.useCallback(
    (userKey: string) => freeInWeek(userKey, weekOffset),
    [freeInWeek, weekOffset]
  );
  const drawnInWeek = React.useCallback(
    (offset: number, passes: (userKey: string) => boolean) => {
      let count = 0;
      for (const userKey of slotsByUser.keys()) if (freeInWeek(userKey, offset) && passes(userKey)) count += 1;
      return count;
    },
    [freeInWeek, slotsByUser]
  );
  // Unknown while a draft's claims are still waiting on everyone's positions, rather than a 0.
  const shownCountFor = (withPicks: CalendarPicks) =>
    withPicks.claims.length > 0 && allPositionsState === 'pending'
      ? null
      : drawnInWeek(weekOffset, includeWith(guardPicks(withPicks)));
  const drawnInOtherWeek = React.useMemo(
    () => drawnInWeek(otherWeekOffset, include),
    [drawnInWeek, include, otherWeekOffset]
  );

  // When a change of picks leaves the week on screen empty and the other week does not, move to it:
  // picking someone free only next week should show them, not an empty week. Once per change, so
  // moving back by hand afterwards sticks. Only after everything the picks are judged on has landed,
  // or a week still loading would read as empty.
  const picksKey = `${effectivePicks.people.join()}|${effectivePicks.claims.join()}|${effectivePicks.matchesOnly}`;
  const settledPicksKey = React.useRef<string | null>(null);
  // Settled only on picks the data could judge: a failed read must not use up the one move it gets.
  const picksSettled =
    !schedulableQuery.isLoading &&
    schedulableQuery.data !== undefined &&
    !picksPending &&
    judgedPicks === effectivePicks;
  React.useEffect(() => {
    if (!picksSettled || settledPicksKey.current === picksKey) return;
    settledPicksKey.current = picksKey;
    if (hasPicks(effectivePicks) && drawnUsers.size === 0 && drawnInOtherWeek > 0) setWeekOffset(otherWeekOffset);
  }, [drawnInOtherWeek, drawnUsers.size, effectivePicks, otherWeekOffset, picksKey, picksSettled]);

  // The line above the week: what is narrowing it, and any pick it is hiding. Only with something
  // picked, so the calendar with nothing picked reads exactly as it did.
  const narrowNote = narrowingSentence({
    picks: judgedPicks,
    shownCount: drawnUsers.size,
    spaceNames: spaceIds.map(spaceId => spaceLabel(labelsById, spaceId)?.name?.trim() || 'a space'),
  });
  const hiddenNote = hiddenPicksSentence({
    hiddenPeople: picks.people.flatMap(profileKey => {
      const known = profileToUser.get(profileKey);
      if (known && drawnUsers.has(known.userKey)) return [];
      return [
        {
          name: known ? speakerLabel(known.person) : 'Someone you picked',
          freeThisWeek: known ? freeThisWeek(known.userKey) : false,
          freeOtherWeek: known ? freeInWeek(known.userKey, otherWeekOffset) : false,
        },
      ];
    }),
    hiddenClaimCount: allPositionsReady ? panelRows.claims.filter(row => row.hidden).length : 0,
    weekLabel: weekLabel(weekOffset),
    otherWeekLabel: weekLabel(otherWeekOffset),
  });
  // A picked person free only in the other week: the line offers that week, not just Clear filters.
  const pickFreeOtherWeek = picks.people.some(profileKey => {
    const known = profileToUser.get(profileKey);
    return Boolean(
      known &&
      !drawnUsers.has(known.userKey) &&
      !freeThisWeek(known.userKey) &&
      freeInWeek(known.userKey, otherWeekOffset)
    );
  });
  const goToOtherWeek = () => goToWeek(otherWeekOffset, otherWeekOffset > weekOffset ? 'next' : 'previous');

  const loading = schedulableQuery.isLoading || (peopleQuery.isLoading && !schedulableQuery.data);
  const loadError = schedulableQuery.error && !schedulableQuery.data ? schedulableQuery.error : null;
  const nobodyFree = unfilteredCells.size === 0;
  const filteredOut = !nobodyFree && cells.size === 0;

  // The viewer's own debates keep the week on screen even with nobody else free in it.
  const ownDebatesThisWeek = debates.some(debate => cellOf(debate.start, days) !== null);

  // One set of props for both forms of the space filter: pills on a desktop, the hub's menu on a phone.
  const spaceFilter = {
    analyticsSurface: 'calendar',
    facetSpaces,
    spaceIds,
    onSpaceToggle: (spaceId: string) => {
      onSpaceToggle(spaceId);
      changeFilter('space');
    },
    onSpacesClear: () => {
      onSpacesClear();
      changeFilter('space');
    },
    countsPending: peopleQuery.isLoading || publishableSpacesPending || personRecordsPending,
  } as const;
  const narrowPills = <CalendarNarrowPills picks={effectivePicks} openTab={panelTab} onToggle={togglePanel} />;
  const panelBody = (
    withPicks: CalendarPicks,
    onPicksChange: (next: CalendarPicks) => void,
    portal: HTMLElement | null,
    onLeave: () => void
  ) => {
    const rows = withPicks === picks ? panelRows : panelRowsFor(withPicks);
    return (
      <CalendarNarrowPanelBody
        tab={panelTab ?? 'people'}
        onTabChange={setPanelTab}
        onClose={() => setPanelTab(null)}
        picks={guardPicks(withPicks)}
        onPicksChange={onPicksChange}
        claims={rows.claims}
        people={rows.people}
        loading={panelTab === 'claims' && allPositionsState === 'pending'}
        viewerHasPositions={viewerHasPositions}
        labelsById={labelsById}
        popoverPortal={portal}
        claimTopics={claimTopics}
        heldByPerson={claimSummaries.heldByPerson}
        topicsPending={!allPositionsReady || panelClaimEntitiesLoading}
        renderPerson={(row, onToggle) =>
          renderRow(
            normId(row.person.person.user_id),
            slotsByUser.get(normId(row.person.person.user_id)) ?? [],
            'calendar_people_panel',
            {
              pick: { selected: row.selected, hidden: row.hidden, onToggle },
              portal,
            }
          )
        }
        onPickTime={(userKey, start, opener) => {
          onLeave();
          openBooking(userKey, isPhone ? null : opener, 'calendar_claim_match', start);
        }}
      />
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b border-grey-02 px-6 py-3 md:px-4">
        {outboundChallenge ? (
          <DebateChallengeCard challenge={outboundChallenge} role="requester" analyticsSurface="calendar" />
        ) : null}
        {/* A row of pills needs a desktop's width; a phone keeps the menu. */}
        {isPhone ? (
          <SpaceTopicFilters {...spaceFilter} trailing={narrowPills} />
        ) : (
          <SpaceFilterPills
            {...spaceFilter}
            className="min-w-0"
            loading={peopleQuery.isLoading || publishableSpacesPending}
          />
        )}
      </div>

      <div className="flex items-stretch">
        <div className="flex min-w-0 flex-1 flex-col">
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

          <CalendarWeekNav
            days={days}
            weekOffset={weekOffset}
            onGoToWeek={goToWeek}
            isPhone={isPhone}
            analyticsLabelPrefix="Debate calendar"
          >
            {/* On a desktop the pills sit on the week's own row, beside the panel they open, and the
                legend moves under the grid. While the panel is open its tabs are the switch, so the
                pills step aside rather than offer the same two choices twice. A phone keeps its
                legend here and its pills in the filter row, where they open the sheet. */}
            {isPhone ? <Legend viewerHasSchedule={viewerHasSchedule} /> : panelTab ? null : narrowPills}
          </CalendarWeekNav>

          {narrowNote || hiddenNote ? (
            <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4" aria-live="polite">
              {[narrowNote, hiddenNote].filter(Boolean).join(' ')}{' '}
              {pickFreeOtherWeek ? (
                <>
                  <button
                    type="button"
                    {...debateSurfaceAnalyticsAttributes('calendar', 'Show other week')}
                    className="underline transition-colors hover:text-text"
                    onClick={goToOtherWeek}
                  >
                    Show {weekLabel(otherWeekOffset)}
                  </button>{' '}
                  ·{' '}
                </>
              ) : null}
              <button
                type="button"
                {...debateSurfaceAnalyticsAttributes('calendar', 'Clear filters', 'filter')}
                className="underline transition-colors hover:text-text"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            </Text>
          ) : null}
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
          {allPositionsState === 'failed' ? (
            <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
              Couldn&rsquo;t load everyone&rsquo;s positions, so claims can&rsquo;t narrow the week yet.
            </Text>
          ) : null}
          {effectivePicks.matchesOnly && judgedPicks.matchesOnly !== effectivePicks.matchesOnly ? (
            <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
              Couldn&rsquo;t load your matches, so Matches only can&rsquo;t narrow the week yet.
            </Text>
          ) : null}
          {blockedReason ? (
            <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
              {blockedReason}
            </Text>
          ) : null}
          {schedulableQuery.data?.truncated && !serverNarrowed ? (
            <Text as="p" variant="footnote" color="grey-04" className="px-6 pb-2 md:px-4">
              Showing the {schedulableQuery.data.people.length} people you have the most matches with. Narrow by space
              to see others.
            </Text>
          ) : null}
          <div className="px-6 pb-6 md:px-4">
            <HubQueryState
              analyticsSurface="calendar"
              isLoading={loading || picksPending}
              loadingFallback={<CalendarWeekSkeleton />}
              error={loadError}
              failureReason={schedulableQuery.failureReason}
              onRetry={() => void schedulableQuery.refetch()}
              isEmpty={(nobodyFree || filteredOut) && !ownDebatesThisWeek}
              // Filters hiding everyone has an undo; nobody being free this week has somewhere to go.
              emptyMessage={
                filteredOut
                  ? drawnInOtherWeek > 0
                    ? `Nobody who matches those filters is free ${weekLabel(weekOffset)}, but ${drawnInOtherWeek} ${
                        drawnInOtherWeek === 1 ? 'is' : 'are'
                      } ${weekLabel(otherWeekOffset)}.`
                    : `Nobody who matches those filters is free ${weekLabel(weekOffset)}.`
                  : 'Nobody has open times this week.'
              }
              emptyNote={filteredOut ? undefined : <DebateHoursNote live />}
              emptyAction={
                filteredOut && drawnInOtherWeek > 0
                  ? { label: `Show ${weekLabel(otherWeekOffset)}`, onClick: goToOtherWeek }
                  : filteredOut
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
                  now={now}
                />
              )}
            </HubQueryState>
            {isPhone ? null : (
              <div className="mt-3 flex justify-end">
                <Legend viewerHasSchedule={viewerHasSchedule} />
              </div>
            )}
          </div>
        </div>

        {/* Docked beside the week on a desktop, the height of the window while the page scrolls. */}
        {!isPhone && panelTab ? (
          <aside
            aria-label="Narrow the calendar"
            className="sticky top-0 flex max-h-dvh w-[380px] shrink-0 flex-col self-start border-l border-grey-02 bg-white pt-1"
          >
            {panelBody(picks, changePicks, popoverPortal, () => undefined)}
          </aside>
        ) : null}
      </div>

      {isPhone ? (
        <CalendarNarrowSheet
          open={panelTab !== null}
          onOpenChange={open => {
            if (!open) setPanelTab(null);
          }}
          picks={picks}
          onApply={changePicks}
          shownCount={shownCountFor}
          renderBody={(draft, setDraft, portal) => panelBody(draft, setDraft, portal, () => setPanelTab(null))}
        />
      ) : null}

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
