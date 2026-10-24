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
  type DebateParticipantSummary,
  type DebateRequest,
  type ScheduledDebateRequest,
  getDebate,
} from '../api';
import { debatePath } from '../debate-routes';
import { useAcceptDebateChallenge, useDebateActivity, useGeoChatAuth, useRejectDebateChallenge } from '../hooks';
import { markLobbyEntry } from '../lobbies/lobby-analytics';
import { hostsLabel } from '../lobbies/lobby-format';
import { LOBBY_DARK_SURFACE_CLASS_NAME } from '../lobbies/lobby-spotlight';
import { debateEntryClick } from '../lobbies/step-out';
import { useMinuteNow } from '../lobbies/use-minute-now';
import { speakerLabel } from '../playback-utils';
import { opponentName, opponentOf } from '../rooms/room-opponent';
import { sameId } from '../rooms/room-presence';
import { debateRoomPath } from '../rooms/room-routes';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { usePersonDebates } from '../use-person-debates';
import { AvailabilityRequestNotice, useAvailabilityRequests } from './availability-request-notice';
import { HubStickyControls } from './claims-tab';
import { SegmentedControl } from './debate-calendar-controls';
import { useAcceptDebateRequest, useBlockDebateUser, useDebateRequests, useDismissDebateRequest } from './hooks';
import { debateAnalyticsLabel, hubAnalyticsAttributes } from './hub-analytics';
import { useHubAskState } from './hub-ask-context';
import { HubPillButton, hubPillClassName } from './hub-pill-button';
import { HUB_SCROLL_SELECTOR, HUB_STICKY_CONTROLS_SELECTOR, useHubScrollSelector } from './hub-scroll';
import { HubQueryState } from './hub-states';
import {
  dedupeHistory,
  historyNames,
  historyOutcomeLabel,
  historyTitle,
  historyWatchable,
  isSettledHistoryItem,
  unnamedHistoryUserIds,
  useDebateHistory,
} from './request-history';
import { RequestOverflowMenu } from './request-overflow-menu';
import { formatTime, formatTimeRange, startOfDay } from './scheduled-debate-format';
import {
  CancelScheduled,
  LOBBY_ACTIONS,
  LinkGoneNotice,
  ScheduledAnswerButtons,
  type ScheduledContent,
  type UpcomingRoomRow,
  adminArrangedNote,
  roomCancellable,
  roomStatusLabel,
  scheduledRequestRoles,
  useLinkedScheduledRequest,
  useParticipantLookup,
  useRescheduler,
  useScheduledContent,
} from './scheduled-debates-section';
import { type UpcomingLobbyRow } from './upcoming-lobby-rows';
import { useAnswerOnce } from './use-answer-once';
import { useCalendarHref } from './use-calendar-href';
import { useDebatesHub } from './use-debates-hub';
import { useGeoChatUserSummaries } from './use-geo-chat-user-summaries';
import { useAskClock } from './use-outgoing-ask';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';
import { useRequestsTabCount } from './use-requests-tab-count';
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

  const scheduled = useScheduledContent();
  const availabilityRequests = useAvailabilityRequests();
  const { authenticated } = useGeoChatAuth();
  const requestsQuery = useDebateRequests(true);
  const { data: activity } = useDebateActivity(true);
  const viewerId = useCurrentGeoChatUserId();
  const incoming = useUnexpiredRequests(requestsQuery.data?.incoming ?? []);
  const challenge = useLiveRequest(activity?.challenge);
  const incomingChallenge =
    challenge && viewerId !== null && sameId(challenge.recipient.user_id, viewerId) ? challenge : null;
  const { ask } = useHubAskState();
  // The badge's own number, so "Needs you (N)" can never disagree with it.
  const needsYouCount = useRequestsTabCount({ authenticated, activity, requests: requestsQuery.data });

  const history = useDebateHistory(true);
  const { personalSpaceId } = usePersonalSpaceId();
  // Only once history has said it cannot answer: the graph read is a stand-in, not a second source.
  const pastDebates = usePersonDebates(personalSpaceId ?? '', history.unavailable);

  // geo-chat names history's people itself; only anyone it could not name is looked up.
  const historyUserIds = React.useMemo(() => unnamedHistoryUserIds(history.items), [history.items]);
  const historyPeople = useGeoChatUserSummaries(historyUserIds, historyUserIds.length > 0);
  const people = React.useMemo(() => [...scheduled.people, ...historyPeople], [historyPeople, scheduled.people]);
  const lookUp = useParticipantLookup(true, people);

  const { answer, busy, error: conflict } = useScheduledDebateAnswer();
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
      lobby: row => <LobbyItem row={row} />,
      history: item => <HistoryRow item={item} lookUp={lookUp} />,
      pastDebate: row => <PastDebateRow row={row} />,
    },
  });

  const shown = filter === 'needs' ? entries.filter(entry => entry.needsYou) : entries;
  const past = shown.filter(entry => entry.when === 'past');
  const present = shown.filter(entry => entry.when === 'now');
  const upcoming = shown.filter(entry => entry.when === 'upcoming');

  const { rootRef, nowLineRef, aboveLineRef, sentinelRef, spacerHeight } = useTimelineScroll({
    // Everything below the now-line that can be known on arrival: anchoring before it lands would put
    // the line in the right place over a list that then grows under it.
    ready: !scheduled.loading && !requestsQuery.isLoading,
    focused: focusedId !== null && linkedShown,
    focusKey: focusedId,
    pastKey: past.map(entry => entry.key).join('|'),
    layoutKey: `${filter}:${present.length}:${upcoming.length}`,
    canLoadMore: filter === 'all' && !history.unavailable && Boolean(history.hasMore),
    loadingMore: history.loadingMore,
    loadMore: history.loadMore,
  });

  const isEmpty = shown.length === 0 && availabilityRequests.length === 0;

  return (
    <div ref={rootRef} className="flex flex-col">
      <HubStickyControls>
        <div className="flex items-center gap-2">
          {/* The Filters popover's segmented control, at the board's 220px. */}
          <div className="w-[220px] shrink-0">
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

      <div className="flex flex-col px-4 pt-1">
        {/* Everything above the now-line that can change height after it is anchored, so the line can
            be held still when any of it grows or shrinks. */}
        <div ref={aboveLineRef} className="flex flex-col">
          {linkGone ? <LinkGoneNotice state={linkGone} className="py-2" /> : null}
          <AvailabilityRequestNotice requests={availabilityRequests} />
          <ReadFailures content={scheduled} />
          {conflict ? (
            <Text as="p" variant="footnote" color="red-01" className="py-2">
              {conflict}
            </Text>
          ) : null}
        </div>

        {/* Only the instant rows depend on the requests read. A debate that is due, an invite, a lobby
            or the past must not vanish behind its error or its warming-up retry, as on the section. */}
        {requestsQuery.error ? (
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
          isLoading={requestsQuery.isLoading && scheduled.loading}
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
            ) : null}
            <DaySections entries={past} now={now} past />
            <NowLine ref={nowLineRef} />
            {present.length > 0 ? (
              <DaySection
                label={<span className="text-browseSection font-semibold tracking-[.3px] text-green">NOW</span>}
              >
                {present.map(entry => (
                  <React.Fragment key={entry.key}>{entry.node}</React.Fragment>
                ))}
              </DaySection>
            ) : null}
            <DaySections entries={upcoming} now={now} todayAbove={past.some(entry => sameDay(entry.at, now))} />
            {/* Room for the now-line to reach the top of the box with only an item or two below it. */}
            <div aria-hidden style={{ height: spacerHeight }} />
          </div>
        </HubQueryState>
      </div>

      {reschedulingModal}
    </div>
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
  history,
  pastDebates,
  render,
}: {
  now: number;
  incoming: DebateRequest[];
  incomingChallenge: DebateChallenge | null;
  ask: unknown;
  scheduled: Pick<ScheduledContent, 'answerable' | 'upcoming' | 'lobbies'>;
  history: DebateHistoryItem[];
  pastDebates: PastDebate[];
  render: {
    incoming: (request: DebateRequest) => React.ReactNode;
    challenge: (challenge: DebateChallenge) => React.ReactNode;
    ask: () => React.ReactNode;
    invite: (request: ScheduledDebateRequest) => React.ReactNode;
    room: (row: UpcomingRoomRow) => React.ReactNode;
    lobby: (row: UpcomingLobbyRow) => React.ReactNode;
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
      // Due, or the other debater is already in: it is happening now rather than at its time.
      when: row.room.due || row.room.others_present ? 'now' : 'upcoming',
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
  // group, where everything shares the same moment.
  return entries
    .filter(entry => Number.isFinite(entry.at))
    .sort(
      (a, b) => (a.when === 'now' && b.when === 'now' ? Number(b.needsYou) - Number(a.needsYou) : 0) || a.at - b.at
    );
}

/** Midnight-anchored key for a day in the viewer's zone. */
function dayKey(at: number) {
  return startOfDay(new Date(at)).getTime();
}

function sameDay(a: number, b: number) {
  return dayKey(a) === dayKey(b);
}

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
    const key = dayKey(entry.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, at: entry.at, entries: [entry] });
  }
  const today = dayKey(now);

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
 * The date column: a filled circle for today, the day of the month otherwise. `repeat` is today's
 * second section, below the now-line: the column is left empty there rather than saying it twice.
 */
function DateLabel({ at, today, repeat }: { at: number; today: boolean; repeat: boolean }) {
  if (repeat) return null;
  const date = new Date(at);
  const weekday = today ? 'TODAY' : date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
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
        {date.getDate()}
      </span>
      <span className="text-footnoteMedium tracking-[.3px] text-grey-04">{weekday}</span>
    </>
  );
}

function NowLine({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} role="separator" aria-label="Now" data-requests-now-line className="relative my-0.5 h-3">
      <span className="absolute top-[5px] right-0 left-0 h-0.5 bg-red-01">
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

/** One row of the timeline: time over title, a status dot, and its actions on one line. */
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
        className={cx('mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full', DOT_CLASS[dot])}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-browseSection leading-4 text-grey-04 tabular-nums">{time}</span>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <Text as="span" variant="metadataMedium">
            {title}
          </Text>
          {needsYou ? <span className="text-footnote font-semibold tracking-[.2px] text-purple">Needs you</span> : null}
        </div>
        {sub ? <span className="text-browseSection leading-[17px] text-grey-04">{sub}</span> : null}
        {actions ? <div className="mt-2 flex flex-nowrap items-center gap-1.5">{actions}</div> : null}
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
  const acceptRequest = useAcceptDebateRequest();
  const dismissRequest = useDismissDebateRequest();
  const blockUser = useBlockDebateUser();
  const { answerOnce, releaseAnswer } = useAnswerOnce();
  const busy = acceptRequest.isPending || dismissRequest.isPending || blockUser.isPending;
  const unavailable = request.requester.in_debate;

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
        <>
          <HubPillButton
            size="compact"
            variant="primary"
            // The card's labels, so the Requests series runs on through the redesign.
            analyticsLabel={debateAnalyticsLabel('hub', 'Accept')}
            onClick={() => answerOnce(() => acceptRequest.mutate({ requestId: request.id }, releaseAnswer))}
            disabled={busy || unavailable}
            pending={acceptRequest.isPending}
            pendingLabel="Accepting…"
          >
            Accept
          </HubPillButton>
          {/* Passes it on to the next person, which is what "Not now" means everywhere now. */}
          <HubPillButton
            size="compact"
            analyticsLabel={debateAnalyticsLabel('hub', 'Dismiss')}
            onClick={() => answerOnce(() => dismissRequest.mutate({ requestId: request.id }, releaseAnswer))}
            disabled={busy}
            pending={dismissRequest.isPending}
            pendingLabel="Passing…"
          >
            Not now
          </HubPillButton>
          <RequestOverflowMenu
            analyticsSurface="hub"
            actions={[
              {
                label: "I don't want to debate this claim",
                analyticsLabel: 'Remove claim request intent',
                onClick: () =>
                  answerOnce(() => dismissRequest.mutate({ requestId: request.id, removeIntent: true }, releaseAnswer)),
              },
              {
                label: `Block ${speakerLabel(request.requester)}`,
                analyticsLabel: 'Block requester',
                destructive: true,
                onClick: () => blockUser.mutate(request.requester.user_id),
              },
            ]}
          />
        </>
      }
    />
  );
}

/** A claimless challenge to the viewer. Accepting opens the claim picker with them. */
function IncomingChallengeItem({ challenge }: { challenge: DebateChallenge }) {
  const clock = useAskClock(challenge.expires_at);
  const accept = useAcceptDebateChallenge();
  const reject = useRejectDebateChallenge();
  const busy = accept.isPending || reject.isPending;
  const actionError = accept.error ?? reject.error;

  return (
    <TimelineItem
      testId="requests-incoming-challenge"
      dot="needs"
      needsYou
      time="Now"
      title={`${speakerLabel(challenge.requester)} wants to debate you`}
      sub={`Pick a claim together · ${clock.label} left`}
      error={actionError instanceof Error ? actionError.message : null}
      actions={
        <>
          <HubPillButton
            size="compact"
            variant="primary"
            analyticsLabel="Debate hub Accept challenge"
            analyticsIntent="accept_debate_challenge"
            onClick={() => accept.mutate(challenge.id)}
            disabled={busy}
            pending={accept.isPending}
            pendingLabel="Accepting…"
          >
            Accept
          </HubPillButton>
          <HubPillButton
            size="compact"
            analyticsLabel="Debate hub Dismiss challenge"
            analyticsIntent="dismiss_debate_challenge"
            onClick={() => reject.mutate(challenge.id)}
            disabled={busy}
          >
            Not now
          </HubPillButton>
        </>
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
      title={ask.kind === 'claim' ? 'Requesting · people who disagree' : `Requesting ${ask.recipientName}`}
      sub={ask.kind === 'claim' ? `${ask.claim.claim} · ${clock.label} left` : `${clock.label} left to answer`}
      actions={
        <HubPillButton
          size="compact"
          analyticsLabel="Debate hub Withdraw request"
          analyticsIntent="withdraw_debate_request"
          onClick={cancel}
          disabled={cancelling}
          pending={cancelling}
          pendingLabel="Cancelling…"
        >
          Cancel
        </HubPillButton>
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
      actions={
        withdrawable ? (
          <>
            {viewerAccepted && onReschedule ? (
              <HubPillButton
                size="compact"
                analyticsLabel={debateAnalyticsLabel('hub', 'Reschedule scheduled request')}
                analyticsIntent="reschedule_scheduled_request"
                onClick={event => onReschedule(event.currentTarget)}
              >
                Reschedule
              </HubPillButton>
            ) : null}
            <CancelScheduled
              compact
              requestId={request.request_id}
              kind={proposedByViewer ? 'request' : 'debate'}
              opponent={opponent}
            />
          </>
        ) : undefined
      }
    />
  );
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
  const router = useRouter();
  const roomPath = debateRoomPath(room.room_id);
  const cancellable = roomCancellable(row);

  return (
    <TimelineItem
      dot={room.others_present || room.due ? 'live' : 'booked'}
      focused={focused}
      time={room.due || room.others_present ? 'Now' : formatTime(room.starts_at)}
      title={`Debate with ${opponentName(opponent)}`}
      sub={roomStatusLabel(room, opponent)}
      actions={
        <>
          {room.joinable ? (
            <Link
              href={roomPath}
              onClick={debateEntryClick(() => router.push(roomPath))}
              className={hubPillClassName('primary', undefined, 'compact')}
              {...hubAnalyticsAttributes('Join scheduled debate', 'join_scheduled_debate')}
            >
              Join
            </Link>
          ) : (
            <span aria-disabled className={hubPillClassName('secondary', 'opacity-40', 'compact')}>
              Join
            </span>
          )}
          {cancellable && onReschedule ? (
            <HubPillButton
              size="compact"
              analyticsLabel="Debate hub Reschedule scheduled debate"
              analyticsIntent="reschedule_scheduled_debate"
              onClick={event => onReschedule(event.currentTarget)}
            >
              Reschedule
            </HubPillButton>
          ) : null}
          {cancellable && requestId ? (
            <CancelScheduled compact requestId={requestId} kind="debate" opponent={opponent} />
          ) : null}
        </>
      }
    />
  );
}

/** A lobby the viewer is going to or hosts, at its time; Live with Join once it is open. */
function LobbyItem({ row }: { row: UpcomingLobbyRow }) {
  const hosts = hostsLabel(row.hosts);
  // The section card's labels, so a lobby's clicks read the same from either layout.
  const [, analyticsLabel, analyticsIntent] = row.open
    ? row.onRoster
      ? LOBBY_ACTIONS.open
      : LOBBY_ACTIONS.join
    : LOBBY_ACTIONS.view;

  return (
    <TimelineItem
      testId="requests-lobby"
      dot={row.open ? 'live' : 'lobby'}
      time={row.open ? 'Live' : formatTime(row.startsAt)}
      title={row.name}
      sub={`Lobby · ${row.hosting ? 'You’re hosting' : hosts ? `Hosted by ${hosts}` : 'You’re going'}`}
      actions={
        <Link
          href={debateRoomPath(row.lobbyId)}
          onClick={() => markLobbyEntry(row.lobbyId, 'requests')}
          className={hubPillClassName(row.open && !row.onRoster ? 'primary' : 'secondary', undefined, 'compact')}
          {...hubAnalyticsAttributes(analyticsLabel, analyticsIntent)}
        >
          {row.open ? (row.onRoster ? 'Open' : 'Join') : 'View'}
        </Link>
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
  const where = item.kind === 'lobby' ? 'Lobby' : item.lobby ? `in ${item.lobby.name}` : null;
  const sub = [item.kind === 'lobby' ? null : claim, where, outcome].filter(Boolean).join(' · ');

  return (
    <TimelineItem
      testId="requests-history"
      dot="past"
      past
      time={formatTime(item.occurred_at)}
      title={title}
      sub={sub || undefined}
      actions={historyWatchable(item) ? <WatchDebate debateId={item.debate_id!} claim={item.claim} /> : undefined}
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
  const analytics = { analyticsLabel: 'Debate hub Watch past debate', analyticsIntent: 'open_debate' };

  if (claim) {
    return (
      <Link
        href={debatePath({ id: debateId, claim })}
        className={hubPillClassName('secondary', undefined, 'compact')}
        data-geo-analytics-label={analytics.analyticsLabel}
        data-geo-analytics-intent={analytics.analyticsIntent}
      >
        Watch
      </Link>
    );
  }

  return (
    <>
      <HubPillButton
        size="compact"
        {...analytics}
        pending={state === 'pending'}
        pendingLabel="Opening…"
        onClick={() => {
          setState('pending');
          void getDebate(debateId, getPrivyIdentityToken, accountKey).then(
            debate => router.push(debatePath(debate)),
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

/** A debate the viewer had, from the graph: the stand-in for history until GEO-3464 ships. */
function PastDebateRow({ row }: { row: PastDebate }) {
  return (
    <TimelineItem
      testId="requests-past-debate"
      dot="past"
      past
      time={formatTime(new Date(row.createdAtSec * 1000).toISOString())}
      title={row.debateClaim?.name ?? row.title}
      sub="Debate · Debated"
      actions={
        <Link
          href={NavUtils.toEntity(row.spaceId, row.entityId)}
          className={hubPillClassName('secondary', undefined, 'compact')}
          {...hubAnalyticsAttributes('Watch past debate', 'open_debate')}
        >
          Watch
        </Link>
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

/** One read failing must not read as an empty schedule, as in `ScheduledDebatesSection`. */
function ReadFailures({ content }: { content: ScheduledContent }) {
  const failures = [
    content.roomsError && `Could not read your upcoming debates: ${content.roomsError.message}`,
    content.requestsError && `Could not read your scheduled debates: ${content.requestsError.message}`,
    content.lobbiesError && `Could not read your lobbies: ${content.lobbiesError.message}`,
  ].filter(Boolean);
  if (failures.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 py-2">
      {failures.map(failure => (
        <Text key={failure as string} as="p" variant="footnote" color="red-01">
          {failure}
        </Text>
      ))}
    </div>
  );
}

/**
 * The timeline's scrolling, in the panel's shared box:
 *
 * - On arrival, the now-line goes just under the sticky filter row, so the next item is the first
 *   thing seen. Once, when the live reads have landed — later growth must not drag the viewer back.
 * - The spacer below lets it get there with only an item or two after the line.
 * - Anything added above the line (history paging in, or the stand-in debates landing) keeps the
 *   line where it was on screen, so the list never jumps under the viewer.
 * - A sentinel at the top pages history in as it comes into view, but only after the first anchor:
 *   before it, the top of a short list is always in view and would page everything at once.
 */
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
  const nowLineRef = React.useRef<HTMLDivElement>(null);
  const aboveLineRef = React.useRef<HTMLDivElement>(null);
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

  // Puts the line back where it was on screen after something above it changed height.
  const holdLine = React.useCallback(() => {
    const measured = measure();
    if (!measured) return;
    const previous = lineOffsetRef.current;
    if (previous !== null && measured.lineOffset !== previous) {
      measured.scroller.scrollTop += measured.lineOffset - previous;
    }
    lineOffsetRef.current = measured.line.getBoundingClientRect().top - measured.scroller.getBoundingClientRect().top;
  }, [measure]);

  // The spacer: enough below the last item for the line to reach the top of the box.
  React.useLayoutEffect(() => {
    const measured = measure();
    const root = rootRef.current;
    if (!measured || !root) return;
    const { scroller, line, stickyHeight } = measured;
    const below = root.getBoundingClientRect().bottom - spacerHeight - line.getBoundingClientRect().top;
    const needed = Math.max(0, Math.round(scroller.clientHeight - stickyHeight - below));
    if (needed !== spacerHeight) setSpacerHeight(needed);
  }, [layoutKey, measure, spacerHeight, pastKey]);

  // The first anchor, and again for each request a link asks for (GEO-3431), which takes the line's
  // place. A link followed while the tab is already open must land on its request too.
  const anchoredForRef = React.useRef<string | null | undefined>(undefined);
  React.useLayoutEffect(() => {
    if (!ready) return;
    const key = focused ? focusKey : null;
    if (anchored && anchoredForRef.current === key) return;
    if (anchored && key === null) return;
    const measured = measure();
    if (!measured) return;
    const { scroller, stickyHeight } = measured;
    const target = focused
      ? (rootRef.current?.querySelector<HTMLElement>('[data-focused]') ?? measured.line)
      : measured.line;
    const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, top - stickyHeight);
    if (focused && target !== measured.line) target.focus({ preventScroll: true });
    lineOffsetRef.current = measured.line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    anchoredForRef.current = key;
    setAnchored(true);
  }, [anchored, focusKey, focused, measure, ready]);

  // Keep the line still when rows arrive above it.
  React.useLayoutEffect(() => {
    if (anchored) holdLine();
  }, [anchored, holdLine, pastKey, loadingMore]);

  // And when anything else above it changes height — a notice landing, a failed read's line, the
  // conflict message. Safari has no CSS scroll anchoring, so nothing else would hold it.
  React.useEffect(() => {
    const region = aboveLineRef.current;
    if (!anchored || !region || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => holdLine());
    observer.observe(region);
    return () => observer.disconnect();
  }, [anchored, holdLine]);

  // Follow the viewer's own scrolling, so the next change restores where they are, not where they were.
  React.useEffect(() => {
    if (!anchored) return;
    const scroller = rootRef.current?.closest<HTMLElement>(hubScrollSelector);
    if (!scroller) return;
    const onScroll = () => {
      const line = nowLineRef.current;
      if (line) lineOffsetRef.current = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
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

  return { rootRef, nowLineRef, aboveLineRef, sentinelRef, spacerHeight };
}
