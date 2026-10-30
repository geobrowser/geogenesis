'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { NavUtils } from '~/core/utils/utils';

import { Text } from '~/design-system/text';

import {
  type DebateChallenge,
  type DebateClaimSummary,
  type DebateHistoryItem,
  type DebateLobbySummary,
  type DebateParticipantSummary,
  type DebateRequest,
  type ScheduledDebateRequest,
  dashlessId,
  getDebate,
  isAccountWarmingUpQuery,
} from '../api';
import { debatePath } from '../debate-routes';
import { useDebateActivity, useGeoChatAuth } from '../hooks';
import { useDebateLobbyCalendar, useDebateLobbyDismissal, useLobbyDismissalError } from '../lobbies/hooks';
import {
  DISMISS_FAILED,
  RSVP_FAILED,
  lobbyErrorMessage,
  localDaysFrom,
  startOfLocalDay,
} from '../lobbies/lobby-format';
import { useLobbyReminderPress } from '../lobbies/lobby-reminder-press';
import { LOBBY_DARK_SURFACE_CLASS_NAME } from '../lobbies/lobby-spotlight';
import { debateEntryClick, routeIntoDebate } from '../lobbies/step-out';
import { LobbyRsvpButton, LobbyRsvpPill } from '../lobbies/upcoming-lobbies';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { speakerLabel } from '../playback-utils';
import { opponentName, opponentOf } from '../rooms/room-opponent';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { usePersonDebates } from '../use-person-debates';
import { AvailabilityRequestNotice, useAvailabilityRequests } from './availability-request-notice';
import { useIncomingChallengeActions } from './challenge-card';
import { HubStickyControls } from './claims-tab';
import { SegmentedControl } from './debate-calendar-controls';
import { dayListParts } from './debate-calendar-model';
import { useDebateRequests } from './hooks';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { useHubAskState } from './hub-ask-context';
import { HUB_EYEBROW_CLASS_NAME } from './hub-eyebrow';
import { askTitle } from './hub-live-strip';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import {
  HUB_SCROLL_SELECTOR,
  HUB_STICKY_CONTROLS_SELECTOR,
  scrollOffsetWithin,
  useHubScrollSelector,
} from './hub-scroll';
import { HubQueryState } from './hub-states';
import { useIncomingRequestActions } from './incoming-request-card';
import { LobbyDetailsPopover } from './lobby-details-popover';
import {
  dedupeHistory,
  historyNames,
  historyOutcomeLabel,
  historyTitle,
  historyWatchable,
  isSettledHistoryItem,
  unnamedHistoryUserIds,
  useDebateHistory,
  useRefreshHistoryWhenLiveEnds,
} from './request-history';
import { RequestOverflowMenu } from './request-overflow-menu';
import { formatTime, formatTimeRange } from './scheduled-debate-format';
import {
  BookedDebateActions,
  CompactActionRow,
  LinkGoneNotice,
  LobbyRowAction,
  ScheduledAnswerButtons,
  type ScheduledContent,
  type UpcomingRoomRow,
  WaitingInviteActions,
  adminArrangedNote,
  readFailureMessages,
  roomStatusLabel,
  scheduledRequestRoles,
  useLinkedScheduledRequest,
  useParticipantLookup,
  useRescheduler,
  useScheduledContent,
} from './scheduled-debates-section';
import { type UpcomingLobbyRow, lobbySubLine, unansweredLobbies, unansweredLobbyRange } from './upcoming-lobby-rows';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { type OutgoingAskState, useAskClock } from './use-outgoing-ask';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';
import { incomingChallengeFor, useRequestsTabCount } from './use-requests-tab-count';
import { type ScheduledDebateAnswer, useScheduledDebateAnswer } from './use-scheduled-debate-answer';

/**
 * Requests as a schedule (GEO-3463): one timeline by day, like a calendar's schedule view. What
 * already happened sits above a red now-line and what is coming below it, and anything waiting on
 * the viewer is tinted and answered in place.
 *
 * It opens on the now-line rather than the top. Past items load above as the viewer scrolls up,
 * without moving what is on screen, so the list reads forwards from "now" however much history is
 * behind it. That history is geo-chat's (GEO-3464); until it is there, the debates the viewer has
 * had stand in, from the graph.
 */
export function RequestsSchedule({ focusedRequestId = null }: { focusedRequestId?: string | null }) {
  const now = useMinuteNow();
  const [filter, setFilter] = React.useState<TimelineFilter>('all');

  // Lobbies in the next seven days (GEO-3519), from the calendar's uncapped range: the ones the viewer
  // has not answered, offered with RSVP and Dismiss, and the ones they RSVP'd to, as going rows at once.
  const today = startOfLocalDay(now);
  const range = React.useMemo(() => unansweredLobbyRange(today), [today]);
  const weekQuery = useDebateLobbyCalendar(range.from, range.to, true, { keepPreviousRange: true });
  const week = weekQuery.data?.lobbies;
  const scheduled = useScheduledContent(week);
  const availabilityRequests = useAvailabilityRequests();
  const { authenticated } = useGeoChatAuth();
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);
  const viewerId = useCurrentGeoChatUserId();
  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const challenge = useLiveRequest(activity?.challenge);
  const incomingChallenge = incomingChallengeFor(challenge, viewerId);
  const { ask } = useHubAskState();
  // The badge's own number, so "Needs you (N)" can never disagree with it.
  const needsYouCount = useRequestsTabCount({ authenticated, activity, requests: requestsQuery.data });

  const history = useDebateHistory(true);
  // A challenge answered or lapsed, or the viewer's own debate over: each joins the past. A debate
  // leaves activity at `thanking`, but geo-chat lists it only once it is complete, which is when the
  // rematch session after it ends; so that ending refreshes the past too.
  useRefreshHistoryWhenLiveEnds([activity?.challenge?.id, activity?.debate?.id, activity?.rematch?.id]);
  const { personalSpaceId, isLoading: personalSpaceLoading } = usePersonalSpaceId();
  // Only once history has said it cannot answer: the graph read is a stand-in, not a second source.
  const pastDebates = usePersonDebates(personalSpaceId ?? '', history.unavailable);

  // geo-chat names history's people itself; only anyone it could not name is looked up.
  const historyUserIds = React.useMemo(() => unnamedHistoryUserIds(history.items), [history.items]);
  const historyPeople = useGeoChatUserSummaries(historyUserIds, historyUserIds.length > 0);
  const people = React.useMemo(() => [...scheduled.people, ...historyPeople], [historyPeople, scheduled.people]);
  // The roster only for the invites and booked debates that show who is online, as on the section:
  // history's people are named by geo-chat and the summaries above.
  const lookUp = useParticipantLookup(scheduled.answerable.length > 0 || scheduled.upcoming.length > 0, people);

  const { answer, busy, error: conflict } = useScheduledDebateAnswer();
  // Held here rather than on each row: a dismissed row leaves at once, and its write has to outlive it.
  const dismissal = useDebateLobbyDismissal();
  const unanswered = React.useMemo(
    () => unansweredLobbies(week ?? [], scheduled.lobbies, viewerId, now),
    [now, scheduled.lobbies, viewerId, week]
  );
  // The lobby whose details are open, held here rather than on its row: an RSVP inside them turns an
  // offered row into a going one, which is another row, and the details stay open on it.
  const [detailsLobbyId, setDetailsLobbyId] = React.useState<string | null>(null);
  const lobbyDetails = React.useCallback(
    (lobbyId: string): LobbyDetailsState => ({
      open: detailsLobbyId !== null && dashlessId(detailsLobbyId) === dashlessId(lobbyId),
      onOpenChange: open =>
        setDetailsLobbyId(current =>
          open ? lobbyId : current !== null && dashlessId(current) === dashlessId(lobbyId) ? null : current
        ),
    }),
    [detailsLobbyId]
  );
  // The debate whose time is being moved, on the other debater's week — as in `ScheduledDebatesSection`.
  const { reschedulerFor, reschedulingModal } = useRescheduler(lookUp);

  // GEO-3431: a link's scheduled request, outlined and scrolled to in place of the now-line.
  const { focusedId, isFocused, linkedShown, linkGone } = useLinkedScheduledRequest(focusedRequestId, scheduled);

  // What the live reads already show, so history does not repeat it (GEO-3464 lists every kind).
  const historyItems = React.useMemo(
    () =>
      dedupeHistory(history.items, {
        requestIds: [
          ...scheduled.answerable.map(request => request.request_id),
          ...scheduled.upcoming.flatMap(row => (row.requestId ? [row.requestId] : [])),
        ],
        lobbyIds: scheduled.lobbies.map(row => row.lobbyId),
      }),
    [history.items, scheduled.answerable, scheduled.lobbies, scheduled.upcoming]
  );

  const entries = buildEntries({
    now,
    incoming,
    incomingChallenge,
    ask,
    scheduled,
    unansweredLobbies: unanswered,
    history: historyItems,
    pastDebates: history.unavailable ? pastDebates.rows : [],
    render: {
      incoming: request => <IncomingRequestItem request={request} />,
      challenge: item => <IncomingChallengeItem challenge={item} />,
      ask: () => <OutgoingAskItem />,
      invite: request => {
        const opponentUserId = opponentOf(request, viewerId);
        return (
          <InviteItem
            request={request}
            opponent={lookUp(opponentUserId)}
            viewerId={viewerId}
            focused={isFocused(request.request_id)}
            busy={busy}
            onAnswer={answer}
            onReschedule={reschedulerFor(
              request.request_id,
              opponentUserId,
              request.viewer_must_answer ? 'requests_new_time' : 'requests_reschedule'
            )}
          />
        );
      },
      room: row => (
        <RoomItem
          row={row}
          opponent={lookUp(row.opponentUserId)}
          focused={isFocused(row.requestId)}
          onReschedule={reschedulerFor(row.requestId, row.opponentUserId, 'requests_reschedule')}
        />
      ),
      lobby: row => <LobbyItem row={row} now={now} details={lobbyDetails(row.lobbyId)} />,
      unansweredLobby: lobby => (
        <UnansweredLobbyItem lobby={lobby} now={now} dismissal={dismissal} details={lobbyDetails(lobby.lobby_id)} />
      ),
      history: item => <HistoryRow item={item} lookUp={lookUp} />,
      pastDebate: row => <PastDebateRow row={row} />,
    },
  });

  const shown = filter === 'needs' ? entries.filter(entry => entry.needsYou) : entries;
  const past = shown.filter(entry => entry.when === 'past');
  const present = shown.filter(entry => entry.when === 'now');
  const upcoming = shown.filter(entry => entry.when === 'upcoming');

  const { rootRef, contentRef, nowLineRef, sentinelRef, spacerHeight } = useTimelineScroll({
    // Everything below the now-line that can be known on arrival: anchoring before it lands would put
    // the line in the right place over a list that then grows under it.
    ready: !scheduled.loading && !requestsQuery.isLoading && !weekQuery.isLoading,
    focused: focusedId !== null && linkedShown,
    focusKey: focusedId,
    pastKey: past.map(entry => entry.key).join('|'),
    layoutKey: `${filter}:${present.length}:${upcoming.length}`,
    // Not after a page has failed: the sentinel would ask again at once, and again, for as long as the
    // top is in view (`useInfiniteScrollSentinel` re-arms on every fetch). The viewer asks instead.
    canLoadMore: filter === 'all' && !history.unavailable && Boolean(history.hasMore) && !history.loadMoreFailed,
    loadingMore: history.loadingMore,
    loadMore: history.loadMore,
  });

  const failures = readFailureMessages({ ...scheduled, weekError: weekQuery.error });
  // geo-chat not knowing a new account yet: retried for about a minute, and said on the first refusal.
  const requestsWarmingUp = isAccountWarmingUpQuery(requestsQuery);
  const requestsTrouble = Boolean(requestsQuery.error) || requestsWarmingUp;
  // Nothing to draw yet while either live read is still on its way, unless all that is left is
  // waiting a new account's refusal out, which the requests' own state says.
  // The graph's stand-in for the past, while history cannot answer (#299 not deployed): still finding
  // the viewer's space, or reading their debates, is the past still loading. Needs you shows no past.
  const standInLoading = filter === 'all' && history.unavailable && (personalSpaceLoading || pastDebates.isLoading);
  const isLoading =
    shown.length === 0 &&
    (scheduled.loading || weekQuery.isLoading || (requestsQuery.isLoading && !requestsWarmingUp) || standInLoading);
  // Empty only when it is known to be: a read that failed is not "nothing", and a read still on its
  // way is not either. Saying so over a failure contradicts it, and over a loading read the message
  // shows for a moment and then swaps out for the timeline, taking the now-line with it.
  const isEmpty =
    shown.length === 0 &&
    availabilityRequests.length === 0 &&
    failures.length === 0 &&
    !requestsTrouble &&
    !scheduled.loading &&
    !weekQuery.isLoading &&
    !(filter === 'all' && (history.isLoading || standInLoading));

  return (
    <div ref={rootRef} className="flex flex-col">
      <HubStickyControls>
        <div className="flex items-center gap-2">
          {/* The Filters popover's segmented control, which fills its row: here the board's 220px. */}
          <div className="w-55 shrink-0">
            <SegmentedControl
              label="Show"
              variant="tinted"
              options={[
                { value: 'all', label: 'All' },
                { value: 'needs', label: `Needs you (${needsYouCount})` },
              ]}
              value={filter}
              onChange={setFilter}
              optionAttributes={option =>
                hubAnalyticsAttributes(
                  option.value === 'all' ? 'Requests All' : 'Requests Needs you',
                  'filter_debate_requests'
                )
              }
            />
          </div>
          <CalendarLink />
        </div>
      </HubStickyControls>

      {/* Observed as one: whatever above the now-line changes height after it is anchored — a notice,
          a failed read's line, a past row whose name resolves late and wraps, "Loading earlier" — the
          line is held where it was. Changes below it leave the line where it is, so they cost nothing. */}
      <div ref={contentRef} className="flex flex-col px-4 pt-1">
        {linkGone ? <LinkGoneNotice state={linkGone} className="py-2" /> : null}
        <AvailabilityRequestNotice requests={availabilityRequests} />
        {failures.length > 0 ? (
          <div className="flex flex-col gap-1 py-2">
            {failures.map(failure => (
              <Text key={failure} as="p" variant="footnote" color="red-01">
                {failure}
              </Text>
            ))}
          </div>
        ) : null}
        {conflict ? (
          <Text as="p" variant="footnote" color="red-01" className="py-2">
            {conflict}
          </Text>
        ) : null}

        {/* Only the instant rows depend on the requests read. A debate that is due, an invite, a lobby
            or the past must not vanish behind its error or its warming-up retry, as on the section.
            Mounted on the failure behind a retry too, as the rail does: until the retries are spent
            there is no `error`, and a new account would never hear "Setting up your account". */}
        {requestsQuery.error || requestsQuery.failureReason ? (
          <HubQueryState
            analyticsSurface="hub"
            isLoading={false}
            error={requestsQuery.error}
            failureReason={requestsQuery.failureReason}
            onRetry={() => void requestsQuery.refetch()}
            isEmpty={false}
            emptyMessage=""
          >
            {null}
          </HubQueryState>
        ) : null}

        <HubQueryState
          analyticsSurface="hub"
          isLoading={isLoading}
          error={null}
          isEmpty={isEmpty}
          emptyMessage={
            filter === 'needs'
              ? 'Nothing needs your answer right now.'
              : 'Any debate requests you’ll receive will appear here.'
          }
          emptyAction={filter === 'needs' ? { label: 'Show all', onClick: () => setFilter('all') } : undefined}
        >
          <div className="flex flex-col">
            {/* Past days load into the space above this as it scrolls into view. */}
            <div ref={sentinelRef} aria-hidden className="h-px" />
            {history.loadingMore ? (
              <Text as="p" variant="footnote" color="grey-04" className="py-2 text-center">
                Loading earlier…
              </Text>
            ) : filter === 'all' && history.loadMoreFailed ? (
              <EarlierFailed onRetry={() => void history.loadMore()} />
            ) : null}
            <DaySections entries={past} now={now} past />
            <NowLine ref={nowLineRef} />
            {present.length > 0 ? (
              <DaySection
                label={<span className="text-browseSection font-semibold tracking-eyebrow text-green">NOW</span>}
              >
                {present.map(entry => (
                  <React.Fragment key={entry.key}>{entry.node}</React.Fragment>
                ))}
              </DaySection>
            ) : null}
            <DaySections
              entries={upcoming}
              now={now}
              todayAbove={past.some(entry => localDaysFrom(entry.at, now) === 0)}
            />
            {/* With only the past to show, the space under the line would otherwise read as broken. Not
                when a read failed or is still on its way: then there may well be something coming up,
                and the failure, or the read landing, says so. */}
            {filter === 'all' &&
            present.length === 0 &&
            upcoming.length === 0 &&
            failures.length === 0 &&
            !requestsTrouble &&
            !scheduled.loading ? (
              <DaySection label={null}>
                <Text as="p" variant="footnote" color="grey-04" data-testid="requests-nothing-ahead">
                  Nothing coming up. Invites and debates you book show up here.
                </Text>
              </DaySection>
            ) : null}
            {/* Room for the now-line (or a linked request) to reach the top of the box with only an
                item or two below it. */}
            <div aria-hidden data-requests-spacer style={{ height: spacerHeight }} />
          </div>
        </HubQueryState>
      </div>

      {reschedulingModal}
    </div>
  );
}

/**
 * A page of the past that failed. Said quietly, in the place it would have filled, with the retry
 * left to the viewer: paging stops here rather than asking again each time the top is in view.
 */
function EarlierFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p role="status" className="py-2 text-center text-footnote text-grey-04">
      Couldn’t load earlier ·{' '}
      <button
        type="button"
        onClick={onRetry}
        className="text-text underline transition-colors hover:text-grey-04"
        {...hubAnalyticsAttributes('Requests Retry earlier', 'retry_debate_history')}
      >
        Try again
      </button>
    </p>
  );
}

type TimelineFilter = 'all' | 'needs';

/** Where an entry sits: above the now-line, in the Now group just under it, or later. */
type Placement = 'past' | 'now' | 'upcoming';

export type TimelineEntry = {
  key: string;
  at: number;
  when: Placement;
  needsYou: boolean;
  node: React.ReactNode;
};

type PastDebate = ReturnType<typeof usePersonDebates>['rows'][number];

/**
 * Every source the timeline draws from, placed and ordered. Pure apart from `render`, which the
 * component passes so each row can keep its own hooks.
 */
export function buildEntries({
  now,
  incoming,
  incomingChallenge,
  ask,
  scheduled,
  unansweredLobbies,
  history,
  pastDebates,
  render,
}: {
  now: number;
  incoming: DebateRequest[];
  incomingChallenge: DebateChallenge | null;
  ask: OutgoingAskState['ask'];
  scheduled: Pick<ScheduledContent, 'answerable' | 'upcoming' | 'lobbies'>;
  /** Upcoming lobbies the viewer has not answered (GEO-3519); see `unansweredLobbies`. */
  unansweredLobbies: DebateLobbySummary[];
  history: DebateHistoryItem[];
  pastDebates: PastDebate[];
  render: {
    incoming: (request: DebateRequest) => React.ReactNode;
    challenge: (challenge: DebateChallenge) => React.ReactNode;
    ask: () => React.ReactNode;
    invite: (request: ScheduledDebateRequest) => React.ReactNode;
    room: (row: UpcomingRoomRow) => React.ReactNode;
    lobby: (row: UpcomingLobbyRow) => React.ReactNode;
    unansweredLobby: (lobby: DebateLobbySummary) => React.ReactNode;
    history: (item: DebateHistoryItem) => React.ReactNode;
    pastDebate: (row: PastDebate) => React.ReactNode;
  };
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const add = (entry: Omit<TimelineEntry, 'at'> & { at: number | string }) =>
    entries.push({ ...entry, at: typeof entry.at === 'number' ? entry.at : Date.parse(entry.at) });

  for (const request of incoming) {
    add({
      key: `request:${request.id}`,
      at: request.created_at,
      when: 'now',
      needsYou: true,
      node: render.incoming(request),
    });
  }
  if (incomingChallenge) {
    add({
      key: `challenge:${incomingChallenge.id}`,
      at: incomingChallenge.created_at,
      when: 'now',
      needsYou: true,
      node: render.challenge(incomingChallenge),
    });
  }
  if (ask) add({ key: 'ask', at: now, when: 'now', needsYou: false, node: render.ask() });

  for (const request of scheduled.answerable) {
    add({
      key: `invite:${request.request_id}`,
      at: request.scheduled_start_at,
      when: 'upcoming',
      needsYou: request.viewer_must_answer,
      node: render.invite(request),
    });
  }
  for (const row of scheduled.upcoming) {
    add({
      key: `room:${row.room.room_id}`,
      at: row.room.starts_at,
      when: roomIsNow(row.room) ? 'now' : 'upcoming',
      needsYou: false,
      node: render.room(row),
    });
  }
  for (const row of scheduled.lobbies) {
    add({
      key: `lobby:${row.lobbyId}`,
      at: row.startsAt,
      when: row.open ? 'now' : 'upcoming',
      needsYou: false,
      node: render.lobby(row),
    });
  }
  // Offered, not asked: nobody is waiting on the viewer's answer, so never Needs you (GEO-3519).
  for (const lobby of unansweredLobbies) {
    add({
      key: `unanswered-lobby:${lobby.lobby_id}`,
      at: lobby.starts_at,
      when: 'upcoming',
      needsYou: false,
      node: render.unansweredLobby(lobby),
    });
  }

  for (const item of history) {
    if (!isSettledHistoryItem(item, now)) continue;
    add({ key: `history:${item.id}`, at: item.occurred_at, when: 'past', needsYou: false, node: render.history(item) });
  }
  for (const row of pastDebates) {
    add({
      key: `debate:${row.entityId}`,
      at: row.createdAtSec * 1000,
      when: 'past',
      needsYou: false,
      node: render.pastDebate(row),
    });
  }

  // Oldest first, so the list reads downwards into the future. What needs an answer leads the Now
  // group, where everything shares the same moment. Placement comes first so the order is one order:
  // needs-you only between two Now entries and time otherwise makes cycles.
  return entries
    .filter(entry => Number.isFinite(entry.at))
    .sort(
      (a, b) =>
        PLACEMENT_RANK[a.when] - PLACEMENT_RANK[b.when] ||
        (a.when === 'now' ? Number(b.needsYou) - Number(a.needsYou) : 0) ||
        a.at - b.at
    );
}

const PLACEMENT_RANK: Record<Placement, number> = { past: 0, now: 1, upcoming: 2 };

/**
 * Entries grouped by day, each day one section with its date in the left column. Today can appear
 * twice — once above the now-line and once below — and only the first carries the date.
 */
function DaySections({
  entries,
  now,
  past = false,
  todayAbove = false,
}: {
  entries: TimelineEntry[];
  now: number;
  past?: boolean;
  /** Today already has a section above the now-line, which carries its date. */
  todayAbove?: boolean;
}) {
  const groups: { key: number; at: number; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const key = startOfLocalDay(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, at: entry.at, entries: [entry] });
  }
  const today = startOfLocalDay(now);

  return (
    <>
      {groups.map(group => (
        <DaySection
          key={group.key}
          label={
            <DateLabel at={group.at} today={group.key === today} repeat={!past && todayAbove && group.key === today} />
          }
        >
          {group.entries.map(entry => (
            <React.Fragment key={entry.key}>{entry.node}</React.Fragment>
          ))}
        </DaySection>
      ))}
    </>
  );
}

/** One day: its date in the left column, its items beside it. A section with no date keeps the column. */
function DaySection({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex gap-2.5 border-b border-divider py-2.5 last:border-b-0">
      <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 pt-1">{label}</div>
      {/* A gap between every item, so two tinted "Needs you" cards read as two, not one block. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

/**
 * The date column: a filled circle for today, the day of the month otherwise, over the weekday — the
 * calendar's day list label, stacked. `repeat` is today's second section, below the now-line: the
 * column is left empty there rather than saying it twice.
 */
function DateLabel({ at, today, repeat }: { at: number; today: boolean; repeat: boolean }) {
  if (repeat) return null;
  const { weekday, day } = dayListParts(new Date(at));
  return (
    <>
      <span
        className={cx(
          'tabular-nums',
          today
            ? 'flex h-8 w-8 items-center justify-center rounded-full bg-text text-quote text-white'
            : 'text-smallTitle'
        )}
      >
        {day}
      </span>
      <span className={HUB_EYEBROW_CLASS_NAME}>{today ? 'TODAY' : weekday.toUpperCase()}</span>
    </>
  );
}

function NowLine({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="separator" aria-label="Now" data-requests-now-line className="relative my-0.5 h-3">
      <span className="absolute top-1.25 right-0 left-0 h-0.5 bg-red-01">
        <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-red-01" />
      </span>
    </div>
  );
}

type Dot = 'needs' | 'booked' | 'waiting' | 'lobby' | 'live' | 'past';

const DOT_CLASS: Record<Dot, string> = {
  needs: 'bg-purple',
  booked: 'bg-text',
  waiting: 'border-2 border-text bg-white',
  lobby: `${LOBBY_DARK_SURFACE_CLASS_NAME} ring-2 ring-grey-02`,
  live: 'bg-green',
  past: 'bg-grey-03',
};

const DOT_LABEL: Record<Dot, string> = {
  needs: 'Needs you',
  booked: 'Booked',
  waiting: 'Waiting on them',
  lobby: 'Lobby',
  live: 'Live',
  past: 'Past',
};

/**
 * One row of the timeline: time over title, a status dot, and its actions. `actions` is the one-line
 * row (`CompactActionRow`) and whatever an action opens under it, such as Cancel's confirm step.
 */
function TimelineItem({
  dot,
  time,
  title,
  sub,
  actions,
  needsYou = false,
  past = false,
  focused = false,
  error = null,
  testId,
}: {
  dot: Dot;
  time: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  needsYou?: boolean;
  past?: boolean;
  /** A link asked for this item (GEO-3431): outlined, and scrolled to on arrival. */
  focused?: boolean;
  /** A failed action, announced as well as drawn, as on the request cards. */
  error?: string | null;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      data-needs-you={needsYou || undefined}
      data-focused={focused || undefined}
      aria-current={focused || undefined}
      tabIndex={focused ? -1 : undefined}
      className={cx(
        'flex items-start gap-2.5 rounded-[10px] p-2',
        needsYou && 'bg-purple-tint',
        past && 'opacity-55',
        focused && 'outline outline-1 outline-text'
      )}
    >
      <span
        aria-label={DOT_LABEL[dot]}
        role="img"
        className={cx('mt-1.25 h-2.5 w-2.5 shrink-0 rounded-full', DOT_CLASS[dot])}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-browseSection leading-4 text-grey-04 tabular-nums">{time}</span>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <Text as="span" variant="metadataMedium">
            {title}
          </Text>
          {needsYou ? (
            <span className="text-footnote font-semibold tracking-eyebrow text-purple">Needs you</span>
          ) : null}
        </div>
        {sub ? <span className="text-browseSection leading-4.25 text-grey-04">{sub}</span> : null}
        {actions ? <div className="mt-2 flex flex-col gap-2">{actions}</div> : null}
        {error ? (
          <div role="alert" className="mt-1">
            <Text as="p" variant="footnote" color="red-01">
              {error}
            </Text>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A live claim request sent to the viewer: Accept · Not now, with its real time left. The card's
 * "…" comes with it — Block and "I don't want to debate this claim" — so the panel keeps a way to
 * block a requester once the popup has gone.
 */
function IncomingRequestItem({ request }: { request: DebateRequest }) {
  const clock = useAskClock(request.expires_at);
  const { accept, dismiss, accepting, dismissing, busy, unavailable, overflowActions } =
    useIncomingRequestActions(request);

  return (
    <TimelineItem
      testId="requests-incoming"
      dot="needs"
      needsYou
      time="Now"
      title={`${speakerLabel(request.requester)} wants to debate now`}
      sub={
        unavailable
          ? `${request.claim.claim} · ${speakerLabel(request.requester)} is in a debate`
          : `${request.claim.claim} · ${clock.label} left`
      }
      actions={
        <CompactActionRow>
          <HubPillButton
            size="compact"
            variant="primary"
            // The card's labels, so the Requests series runs on through the redesign.
            analyticsLabel={debateAnalyticsLabel('hub', 'Accept')}
            onClick={accept}
            disabled={busy || unavailable}
            pending={accepting}
            pendingLabel="Accepting…"
          >
            Accept
          </HubPillButton>
          {/* Passes it on to the next person, as "Not now" does on a claim request. A challenge's own
              Dismiss is final, so it is not called "Not now" (`IncomingChallengeItem`). */}
          <HubPillButton
            size="compact"
            analyticsLabel={debateAnalyticsLabel('hub', 'Dismiss')}
            onClick={dismiss}
            disabled={busy}
            pending={dismissing}
            pendingLabel="Passing…"
          >
            Not now
          </HubPillButton>
          <RequestOverflowMenu analyticsSurface="hub" actions={overflowActions} />
        </CompactActionRow>
      }
    />
  );
}

/** A claimless challenge to the viewer. Accepting opens the claim picker with them. */
function IncomingChallengeItem({ challenge }: { challenge: DebateChallenge }) {
  const clock = useAskClock(challenge.expires_at);
  const { accept, reject, accepting, rejecting, busy, error } = useIncomingChallengeActions(challenge);

  return (
    <TimelineItem
      testId="requests-incoming-challenge"
      dot="needs"
      needsYou
      time="Now"
      title={`${speakerLabel(challenge.requester)} wants to debate you`}
      sub={`Pick a claim together · ${clock.label} left`}
      error={error}
      actions={
        <CompactActionRow>
          <HubPillButton
            size="compact"
            variant="primary"
            analyticsLabel={debateAnalyticsLabel('hub', 'Accept challenge')}
            analyticsIntent="accept_debate_challenge"
            onClick={accept}
            disabled={busy}
            pending={accepting}
            pendingLabel="Accepting…"
          >
            Accept
          </HubPillButton>
          {/* Rejects it for good: the requester's wait ends and their history reads that you declined.
              Worded as the challenge card words it, not as a claim request's "Not now", which only
              passes a request on. */}
          <HubPillButton
            size="compact"
            analyticsLabel={debateAnalyticsLabel('hub', 'Dismiss challenge')}
            analyticsIntent="dismiss_debate_challenge"
            onClick={reject}
            disabled={busy}
            pending={rejecting}
            pendingLabel="Dismissing…"
          >
            Dismiss
          </HubPillButton>
        </CompactActionRow>
      }
    />
  );
}

/** The viewer's own open ask, which the strip above the tabs also shows. */
function OutgoingAskItem() {
  const { ask, cancel, cancelling } = useHubAskState();
  const clock = useAskClock(ask?.expiresAt ?? null);
  if (!ask) return null;

  return (
    <TimelineItem
      testId="requests-outgoing"
      dot="waiting"
      time="Now"
      title={askTitle(ask)}
      sub={ask.kind === 'claim' ? `${ask.claim.claim} · ${clock.label} left` : `${clock.label} left to answer`}
      actions={
        <CompactActionRow>
          <HubPillButton
            size="compact"
            analyticsLabel={debateAnalyticsLabel('hub', 'Withdraw request')}
            analyticsIntent="withdraw_debate_request"
            onClick={cancel}
            disabled={cancelling}
            pending={cancelling}
            pendingLabel="Cancelling…"
          >
            Cancel
          </HubPillButton>
        </CompactActionRow>
      }
    />
  );
}

/**
 * A scheduled invite still open: one to answer (Accept · Decline · Suggest a time) or one waiting on
 * the other side. No "expires at start" — the time it is for already says when it lapses.
 */
function InviteItem({
  request,
  opponent,
  viewerId,
  focused,
  busy,
  onAnswer,
  onReschedule,
}: {
  request: ScheduledDebateRequest;
  opponent: DebateParticipantSummary | null;
  viewerId: string | null;
  focused: boolean;
  busy: boolean;
  onAnswer: ScheduledDebateAnswer;
  onReschedule: ((opener: HTMLElement) => void) | null;
}) {
  const { proposedByViewer, viewerAccepted, withdrawable } = scheduledRequestRoles(request, viewerId);
  const name = opponentName(opponent);
  const note = adminArrangedNote(request, opponent, viewerId);
  const slot = formatTimeRange(request.scheduled_start_at, request.scheduled_end_at);

  if (request.viewer_must_answer) {
    return (
      <TimelineItem
        dot="needs"
        needsYou
        focused={focused}
        time={formatTime(request.scheduled_start_at)}
        // An arranged match has no inviter: nobody asked anybody, so it is a debate with them.
        title={request.invited_by_user_id ? `${name} invited you` : `Debate with ${name}`}
        sub={note ?? `Debate · ${slot}`}
        actions={
          // Keyed on the request's version, as the section keys it: a moved time can be answered again.
          <ScheduledAnswerButtons
            key={`${request.scheduled_start_at}:${request.reschedule_count}`}
            layout="inline"
            requestId={request.request_id}
            busy={busy}
            onAnswer={onAnswer}
            onReschedule={onReschedule}
            analyticsSurface="hub"
          />
        }
      />
    );
  }

  return (
    <TimelineItem
      dot="waiting"
      focused={focused}
      time={formatTime(request.scheduled_start_at)}
      title={viewerAccepted && !proposedByViewer ? `Debate with ${name}` : `Invite to ${name}`}
      sub={note ?? `Waiting on their answer · ${slot}`}
      // Decided here rather than left to the actions, which draw nothing when the invite can't be
      // taken back: handed that, the row still kept a gap for them.
      actions={
        withdrawable ? (
          <WaitingInviteActions
            compact
            request={request}
            opponent={opponent}
            viewerId={viewerId}
            onReschedule={onReschedule}
          />
        ) : undefined
      }
    />
  );
}

/** Due, or the other debater is already in: a booked debate happening now rather than at its time. */
function roomIsNow(room: UpcomingRoomRow['room']) {
  return room.due || room.others_present;
}

/** A booked debate: Join once the room opens, and Reschedule or Cancel until anyone is in it. */
function RoomItem({
  row,
  opponent,
  focused,
  onReschedule,
}: {
  row: UpcomingRoomRow;
  opponent: DebateParticipantSummary | null;
  focused: boolean;
  onReschedule: ((opener: HTMLElement) => void) | null;
}) {
  const { room, requestId } = row;

  return (
    <TimelineItem
      dot={roomIsNow(room) ? 'live' : 'booked'}
      focused={focused}
      time={roomIsNow(room) ? 'Now' : formatTime(room.starts_at)}
      title={`Debate with ${opponentName(opponent)}`}
      sub={roomStatusLabel(room, opponent)}
      actions={
        <BookedDebateActions
          compact
          room={room}
          requestId={requestId}
          opponent={opponent}
          onReschedule={onReschedule}
        />
      }
    />
  );
}

/** A lobby's details, open or not; held by the timeline so they outlive the row (GEO-3519). */
type LobbyDetailsState = { open: boolean; onOpenChange: (open: boolean) => void };

/**
 * A lobby the viewer is going to or hosts, at its time; Live with Join once it is open. Going and
 * still to open, its name opens the lobby's details, as on an offered row (GEO-3519), with RSVP there
 * showing Going.
 */
function LobbyItem({ row, now, details }: { row: UpcomingLobbyRow; now: number; details: LobbyDetailsState }) {
  const summary = !row.open && !row.hosting ? row.summary : null;
  return (
    <TimelineItem
      testId="requests-lobby"
      dot={row.open ? 'live' : 'lobby'}
      time={row.open ? 'Live' : formatTime(row.startsAt)}
      title={
        summary ? (
          <LobbyDetailsPopover
            lobby={summary}
            now={now}
            rsvp={<LobbyRsvpButton lobby={summary} analyticsLabelPrefix="Requests lobby" />}
            {...details}
            className="text-left underline-offset-2 hover:underline"
          >
            {row.name}
          </LobbyDetailsPopover>
        ) : (
          row.name
        )
      }
      sub={lobbySubLine(row, 'You’re going')}
      // The section card's button, so a lobby's clicks read the same from either layout.
      actions={
        <CompactActionRow>
          <LobbyRowAction compact row={row} />
        </CompactActionRow>
      }
    />
  );
}

/**
 * An upcoming lobby the viewer has not answered (GEO-3519): RSVP, after which it is a lobby they are
 * going to ({@link LobbyItem}), or Dismiss, after which it leaves the timeline. Its name opens the
 * lobby's details, with the same RSVP.
 */
function UnansweredLobbyItem({
  lobby,
  now,
  dismissal,
  details,
}: {
  lobby: DebateLobbySummary;
  now: number;
  dismissal: Pick<ReturnType<typeof useDebateLobbyDismissal>, 'mutate'>;
  details: LobbyDetailsState;
}) {
  const remind = useLobbyReminderPress(lobby);
  const dismissError = useLobbyDismissalError(lobby.lobby_id);
  // One press for both copies of RSVP: the row's and the details'.
  const rsvp = (
    <LobbyRsvpPill
      size="compact"
      remind={remind}
      analyticsLabel={debateAnalyticsLabel('hub', `Requests lobby ${remind.reminded ? 'Going' : 'RSVP'}`)}
    />
  );

  return (
    <TimelineItem
      testId="requests-unanswered-lobby"
      dot="lobby"
      time={formatTime(lobby.starts_at)}
      title={
        <LobbyDetailsPopover
          lobby={lobby}
          now={now}
          rsvp={rsvp}
          {...details}
          className="text-left underline-offset-2 hover:underline"
        >
          {lobby.name}
        </LobbyDetailsPopover>
      }
      sub={lobbySubLine({ hosting: false, hosts: lobby.hosts })}
      error={
        remind.error
          ? lobbyErrorMessage(remind.error, RSVP_FAILED)
          : dismissError
            ? lobbyErrorMessage(dismissError, DISMISS_FAILED)
            : null
      }
      actions={
        <CompactActionRow>
          {rsvp}
          <HubPillButton
            size="compact"
            analyticsLabel={debateAnalyticsLabel('hub', 'Requests lobby dismiss')}
            analyticsIntent="dismiss_debate_lobby"
            onClick={() => dismissal.mutate({ lobbyId: lobby.lobby_id, dismissed: true })}
            disabled={remind.pending}
          >
            Dismiss
          </HubPillButton>
        </CompactActionRow>
      }
    />
  );
}

/** Something that already happened, from geo-chat's history (GEO-3464), with how it ended. */
function HistoryRow({
  item,
  lookUp,
}: {
  item: DebateHistoryItem;
  lookUp: (userId: string | null) => DebateParticipantSummary | null;
}) {
  const names = historyNames(item, lookUp);
  const outcome = historyOutcomeLabel(item);
  const claim = item.claim?.claim ?? null;
  const title = historyTitle(item, names);

  // A request, challenge or debate made in a lobby says which (geo-chat#299 carries it).
  // A lobby geo-chat no longer has a name for comes as "", which says nothing about where.
  const where = item.kind === 'lobby' ? 'Lobby' : item.lobby?.name ? `in ${item.lobby.name}` : null;
  const sub = [item.kind === 'lobby' ? null : claim, where, outcome].filter(Boolean).join(' · ');

  return (
    <TimelineItem
      testId="requests-history"
      dot="past"
      past
      time={formatTime(item.occurred_at)}
      title={title}
      sub={sub || undefined}
      actions={
        historyWatchable(item) ? (
          <CompactActionRow>
            <WatchDebate debateId={item.debate_id!} claim={item.claim} />
          </CompactActionRow>
        ) : undefined
      }
    />
  );
}

/**
 * A past debate's page. History's claim carries the space the page lives under, so the link is built
 * from it directly; only an item without one resolves the debate on press, and says so if it can't.
 */
function WatchDebate({ debateId, claim }: { debateId: string; claim: DebateClaimSummary | null }) {
  const router = useRouter();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const [state, setState] = React.useState<'idle' | 'pending' | 'failed'>('idle');

  if (claim) return <WatchLink href={debatePath({ id: debateId, claim })} />;

  return (
    <>
      <HubPillButton
        size="compact"
        analyticsLabel={debateAnalyticsLabel('hub', WATCH_ANALYTICS.action)}
        analyticsIntent={WATCH_ANALYTICS.intent}
        pending={state === 'pending'}
        pendingLabel="Opening…"
        onClick={() => {
          setState('pending');
          void getDebate(debateId, getPrivyIdentityToken, accountKey).then(
            debate => routeIntoDebate(() => router.push(debatePath(debate))),
            () => setState('failed')
          );
        }}
      >
        Watch
      </HubPillButton>
      {state === 'failed' ? (
        <span role="alert" className="text-footnote text-red-01">
          Couldn’t open it
        </span>
      ) : null}
    </>
  );
}

/** One Watch series, whichever way a past debate is opened: from history, or from the graph's stand-in. */
const WATCH_ANALYTICS = { action: 'Watch past debate', intent: 'open_debate' } as const;

/** Into a debate's page like any other way in: from a lobby, a plain click steps out of it first. */
function WatchLink({ href }: { href: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      onClick={debateEntryClick(() => router.push(href))}
      className={hubPillClassName('secondary', undefined, 'compact')}
      {...hubAnalyticsAttributes(WATCH_ANALYTICS.action, WATCH_ANALYTICS.intent)}
    >
      Watch
    </Link>
  );
}

/** A debate the viewer had, from the graph: the stand-in for history until GEO-3464 ships. */
function PastDebateRow({ row }: { row: PastDebate }) {
  return (
    <TimelineItem
      testId="requests-past-debate"
      dot="past"
      past
      time={formatTime(row.createdAtSec * 1000)}
      title={row.debateClaim?.name ?? row.title}
      sub="Debate · Debated"
      actions={
        <CompactActionRow>
          <WatchLink href={NavUtils.toEntity(row.spaceId, row.entityId)} />
        </CompactActionRow>
      }
    />
  );
}

/** The calendar, from the filter row, as the design has it. Closes the panel so the week is not covered. */
function CalendarLink() {
  const { close } = useDebatesHub();
  const href = useCalendarHref();
  return (
    <Link
      href={href}
      onClick={close}
      {...hubAnalyticsAttributes('Requests Open calendar', 'open_debate_calendar')}
      className="ml-auto shrink-0 text-browseSection text-grey-04 transition-colors hover:text-text"
    >
      Open calendar →
    </Link>
  );
}

/**
 * The timeline's scrolling, in the panel's shared box:
 *
 * - On arrival, the now-line goes just under the sticky filter row, so the next item is the first
 *   thing seen. Once, when the live reads have landed — later growth must not drag the viewer back.
 *   A link's request (GEO-3431) takes the line's place.
 * - The spacer below lets it get there with only an item or two after it.
 * - Anything added above the line (history paging in, or the stand-in debates landing) keeps the
 *   line where it was on screen, so the list never jumps under the viewer.
 * - A sentinel at the top pages history in as it comes into view, but only after the first anchor:
 *   before it, the top of a short list is always in view and would page everything at once.
 */
/** Between the filter row and the now-line once landed, so the red line is never tucked under the row. */
const LINE_GAP_PX = 8;

/**
 * How long the line is watched after it lands, in frames, for an animation still carrying it: the
 * tab's and the empty state's `HubSwap` slide their content up 4px as it fades in, and a transform
 * moves nothing a resize or a key would notice. Done once the line has stopped moving for a few.
 */
const SETTLE_MAX_FRAMES = 60;
const SETTLE_STILL_FRAMES = 3;

function useTimelineScroll({
  ready,
  focused,
  focusKey,
  pastKey,
  layoutKey,
  canLoadMore,
  loadingMore,
  loadMore,
}: {
  ready: boolean;
  focused: boolean;
  /** The request a link asked for. A new one, arriving while the tab is open, is scrolled to too. */
  focusKey: string | null;
  pastKey: string;
  layoutKey: string;
  canLoadMore: boolean;
  loadingMore: boolean;
  loadMore: () => unknown;
}) {
  const hubScrollSelector = useHubScrollSelector() ?? HUB_SCROLL_SELECTOR;
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Everything under the filter row: the notices, the past, the line and what follows it.
  const contentRef = React.useRef<HTMLDivElement>(null);
  const nowLineRef = React.useRef<HTMLDivElement | null>(null);
  /**
   * The line mounting, as state. With nothing upcoming and the past still loading, the tab shows its
   * empty state, and when the past lands the timeline (the line with it) mounts only once that state
   * has animated out — after every effect here has already run and found no line to measure. Nothing
   * else changed then, so nothing ran again: no spacer, no anchor, and the tab sat on past days
   * (27 Oct). The line arriving is itself the change the effects need to hear.
   */
  const [lineMounted, setLineMounted] = React.useState(false);
  const attachNowLine = React.useCallback((node: HTMLDivElement | null) => {
    nowLineRef.current = node;
    setLineMounted(node !== null);
  }, []);
  const [anchored, setAnchored] = React.useState(false);
  const [spacerHeight, setSpacerHeight] = React.useState(0);
  // Where the now-line sat in the box, last time anyone looked: what a change above it restores.
  const lineOffsetRef = React.useRef<number | null>(null);

  const measure = React.useCallback(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector) ?? null;
    const line = nowLineRef.current;
    if (!scroller || !line) return null;
    const sticky = scroller.querySelector<HTMLElement>(HUB_STICKY_CONTROLS_SELECTOR);
    return {
      scroller,
      line,
      stickyHeight: sticky?.getBoundingClientRect().height ?? 0,
      lineOffset: line.getBoundingClientRect().top - scroller.getBoundingClientRect().top,
    };
  }, [hubScrollSelector]);

  /** What the pin aims for: the request a link asked for while it is shown, the line otherwise. */
  const pinTarget = React.useCallback(
    (line: HTMLElement) => (focused ? rootRef.current?.querySelector<HTMLElement>('[data-focused]') : null) ?? line,
    [focused]
  );

  /**
   * Until the viewer scrolls the box themselves, the line (or a linked request) stays at the top, and
   * every change in layout re-places it rather than trying to keep an offset. The rows above it, the
   * past, mostly arrive after the first anchor, and while they push the line down the box often can't
   * scroll far enough yet: the spacer that makes room renders a pass later. Keeping the offset then
   * recorded that short position as the viewer's own, and the tab stayed on past days (27 Oct).
   */
  const pinnedRef = React.useRef(true);
  /**
   * Where the pin last left the box. A scroll that ends anywhere else is the viewer's, whatever moved
   * it: dragging the scrollbar fires none of the input events in some browsers. Read back after the
   * write, so the browser's clamping is what is remembered. 0 before the first pin, where opening the
   * tab leaves the shared box (`changeTab` resets it).
   */
  const pinScrollTopRef = React.useRef(0);
  /**
   * Scrolls the line (or the request a link asked for) to just under the filter row. `reached` is
   * false when the box could not scroll that far yet — the spacer that makes room renders a pass
   * later — so a caller knows to try again rather than settle short.
   */
  const pinToTarget = React.useCallback(() => {
    const measured = measure();
    if (!measured) return null;
    const { scroller, stickyHeight } = measured;
    const target = pinTarget(measured.line);
    const wanted = Math.max(0, scrollOffsetWithin(target, scroller) - stickyHeight - LINE_GAP_PX);
    if (Math.abs(scroller.scrollTop - wanted) > 1) scroller.scrollTop = wanted;
    pinScrollTopRef.current = scroller.scrollTop;
    lineOffsetRef.current = measured.line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    return { reached: scroller.scrollTop + 1 >= wanted, linked: target === measured.line ? null : target };
  }, [measure, pinTarget]);

  // Puts the line back where it was on screen after something above it changed height.
  const holdLine = React.useCallback(() => {
    if (pinnedRef.current) {
      pinToTarget();
      return;
    }
    const measured = measure();
    if (!measured) return;
    const previous = lineOffsetRef.current;
    if (previous !== null && measured.lineOffset !== previous) {
      measured.scroller.scrollTop += measured.lineOffset - previous;
    }
    lineOffsetRef.current = measured.line.getBoundingClientRect().top - measured.scroller.getBoundingClientRect().top;
  }, [measure, pinToTarget]);

  /**
   * The spacer: enough below the pin's target for it to reach the top of the box. Measured from the
   * target, not the line: a linked request further down needs that much more room, and sized for the
   * line it sat past the end of the scroll, so the anchor never landed — no paging, no hold, no focus,
   * and every resize dragged the viewer back to the bottom.
   *
   * Again for each link (`focusKey`), whose request may sit further down than the last one's, and on
   * every resize (the observer below): the box growing with the content unchanged — the live strip
   * or the no-times line going, a phone's URL bar collapsing — clamps the scroll and drops the line.
   * It cannot chase itself: what it measures, the room below the target, leaves the spacer out.
   */
  const committedSpacerRef = React.useRef(0);
  const fitSpacer = React.useCallback(() => {
    const measured = measure();
    const root = rootRef.current;
    if (!measured || !root) return;
    const { scroller, stickyHeight } = measured;
    const target = pinTarget(measured.line);
    const below = root.getBoundingClientRect().bottom - committedSpacerRef.current - target.getBoundingClientRect().top;
    const needed = Math.max(0, Math.round(scroller.clientHeight - stickyHeight - below));
    if (needed !== committedSpacerRef.current) setSpacerHeight(needed);
  }, [measure, pinTarget]);

  React.useLayoutEffect(() => {
    committedSpacerRef.current = spacerHeight;
    fitSpacer();
  }, [fitSpacer, focusKey, layoutKey, lineMounted, pastKey, spacerHeight]);

  // The first anchor, and again for each request a link asks for (GEO-3431), which takes the line's
  // place. A link followed while the tab is already open must land on its request too.
  const anchoredForRef = React.useRef<string | null | undefined>(undefined);
  React.useLayoutEffect(() => {
    if (!ready) return;
    const key = focused ? focusKey : null;
    if (anchored && anchoredForRef.current === key) return;
    if (anchored && key === null) return;
    // The reads can take a minute to land (a new account's requests are retried while geo-chat warms
    // up) with the rows already drawn. A viewer who scrolled meanwhile keeps their place: the first
    // anchor only marks where the line is, so holding and paging can start from there.
    if (!anchored && !pinnedRef.current) {
      const measured = measure();
      if (!measured) return;
      lineOffsetRef.current = measured.lineOffset;
      const target = pinTarget(measured.line);
      if (target !== measured.line) target.focus({ preventScroll: true });
      anchoredForRef.current = key;
      setAnchored(true);
      return;
    }
    // A new link takes the scroll back from wherever the viewer had it.
    pinnedRef.current = true;
    const pinned = pinToTarget();
    // Not done until it got there: with nothing below the line, the spacer that makes the room
    // renders a pass after this, and marking it done then left the tab on past days (26 Oct).
    if (!pinned?.reached) return;
    pinned.linked?.focus({ preventScroll: true });
    anchoredForRef.current = key;
    setAnchored(true);
  }, [anchored, focusKey, focused, lineMounted, measure, pinTarget, pinToTarget, ready, spacerHeight]);

  // Keep the line still when rows arrive above it, and re-pin once the spacer has made room. And when
  // the line itself comes back: an empty "Needs you" swaps the timeline out, and on "All" it mounts
  // again only after this has run for the new rows, with nothing left to measure (27 Oct's bug).
  //
  // `pastKey`, `loadingMore` and `layoutKey` stay although the observer below sees most of what they
  // mean: it misses a change that moves the line while the content's total height stays the same
  // (a past row swapped for one as tall), and these land in the same commit, before the paint.
  React.useLayoutEffect(() => {
    if (anchored) holdLine();
  }, [anchored, holdLine, lineMounted, pastKey, loadingMore, layoutKey, spacerHeight]);

  /**
   * After the line lands or comes back, hold it for as long as an entrance animation is still moving
   * it: a transform is invisible to everything above, and pinning mid-slide left the line 4px off
   * where it belongs. Each frame re-applies the hold, so it ends where it would have without one.
   */
  React.useEffect(() => {
    if (!anchored || !lineMounted || typeof requestAnimationFrame !== 'function') return;
    let frame = 0;
    let still = 0;
    let handle = requestAnimationFrame(function step() {
      const scroller = measure()?.scroller;
      if (!scroller) return;
      const before = scroller.scrollTop;
      holdLine();
      still = Math.abs(scroller.scrollTop - before) < 0.5 ? still + 1 : 0;
      frame += 1;
      if (still < SETTLE_STILL_FRAMES && frame < SETTLE_MAX_FRAMES) handle = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(handle);
  }, [anchored, holdLine, lineMounted, measure]);

  // The viewer taking the scroll is what ends the pin: from then on their place is what is kept. Their
  // input, at once, and any scroll the pin did not make (`pinScrollTopRef`, in the effect below).
  React.useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector);
    if (!scroller) return;
    const release = () => {
      pinnedRef.current = false;
    };
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const name of events) scroller.addEventListener(name, release, { passive: true });
    return () => {
      for (const name of events) scroller.removeEventListener(name, release);
    };
  }, [hubScrollSelector]);

  // CSS scroll anchoring off on the box while the timeline is in it, so the holding here is the only
  // holding in every browser. Chrome's can move `scrollTop` in a task where `holdLine` does not run,
  // and the scroll handler then takes that for the viewer's and releases the pin. It goes on the box:
  // the scroll container's own `overflow-anchor` is what turns anchoring off; on the content it would
  // only rule rows out as anchors. Put back on the way out, for the panel's other tabs.
  React.useLayoutEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector);
    if (!scroller) return;
    const previous = scroller.style.getPropertyValue('overflow-anchor');
    scroller.style.setProperty('overflow-anchor', 'none');
    return () => {
      if (previous) scroller.style.setProperty('overflow-anchor', previous);
      else scroller.style.removeProperty('overflow-anchor');
    };
  }, [hubScrollSelector]);

  // And when anything else changes height — a notice landing, a failed read's line, a past row whose
  // name resolves late and wraps, a font arriving. Safari has no CSS scroll anchoring, so nothing
  // else would hold it. One observer on the whole content: a change below the line leaves the line
  // where it is, so holding it there costs nothing.
  //
  // The box as well as the content, and the spacer re-fitted as well as the line held: the box
  // changing height changes how much room the target needs below it.
  React.useEffect(() => {
    const content = contentRef.current;
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector);
    if (!anchored || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      fitSpacer();
      holdLine();
    });
    observer.observe(content);
    if (scroller) observer.observe(scroller);
    return () => observer.disconnect();
  }, [anchored, fitSpacer, holdLine, hubScrollSelector]);

  // Follow the viewer's own scrolling, so the next change restores where they are, not where they were.
  React.useEffect(() => {
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector);
    if (!scroller) return;
    const onScroll = () => {
      if (pinnedRef.current) {
        // The pin's own scrolling is not the viewer's place; anywhere else it did not put the box is.
        if (Math.abs(scroller.scrollTop - pinScrollTopRef.current) <= 1) return;
        pinnedRef.current = false;
      }
      const line = nowLineRef.current;
      if (anchored && line) {
        lineOffsetRef.current = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      }
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [anchored, hubScrollSelector]);

  // Page history in from the top, only after the first anchor: before it, the top of a short list is
  // always in view and would page everything at once.
  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: anchored && canLoadMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    rootMargin: '400px 0px 0px 0px',
    rootSelector: hubScrollSelector,
  });

  return { rootRef, contentRef, nowLineRef: attachNowLine, sentinelRef, spacerHeight };
}
