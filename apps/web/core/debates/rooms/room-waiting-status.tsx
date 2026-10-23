'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { type DebateRoomView, GeoChatRequestError } from '../api';
import { debateAnalyticsLabel } from '../matchmaking/hub-analytics';
import { HubPillButton } from '../matchmaking/hub-pill-button';
import { formatTime } from '../matchmaking/scheduled-debate-format';
import { useServerNow } from '../matchmaking/use-request-countdown';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useDebateRoomContext } from './room-context';
import { ROOM_WAITING_STATUS as COPY } from './room-copy';
import { RoomRescheduleButton } from './room-presence-indicator';
import {
  type RoomWaitingEntry,
  minutesSince,
  nudgeButtonState,
  opponentPresence,
  roomWaitingTimeline,
  showsWaitingStatus,
} from './room-waiting';
import { useNudgeDebateRoom } from './scheduling-hooks';

/**
 * What the debater waiting in a scheduled room is told about the other one (GEO-3428, boards 6 and
 * 6b): whether they are on Geo now or when they last were, which reminders we sent them, the
 * viewer's nudges, and what they said; then Nudge and Reschedule. Leave is the room's own button in
 * the viewer's card (GEO-3433), which now opens the People tab: a second Leave here would be two
 * buttons doing one thing.
 *
 * Under the room's presence pill, while the viewer sits in the room past the start and the other
 * person is not in it. Nothing else about the other person's activity is shown (no pages, devices or
 * dismissed prompts): Preston's call, 21 Oct.
 *
 * Once they said they are running late, the late notice in their video slot carries how late, the
 * note and Reschedule, so this keeps the timeline, drops its heading and Reschedule, and has nobody
 * to nudge.
 */
export function RoomWaitingStatus({
  opponentName,
  viewerName,
}: {
  /** The other debater's first name, or the stand-in. */
  opponentName: string;
  /** The viewer's own first name, which the "waiting for you" email put in its subject. */
  viewerName: string | null;
}) {
  const context = useDebateRoomContext();
  const room = context?.room ?? null;
  const presence = context?.presence ?? null;
  const viewerId = useCurrentGeoChatUserId();
  // geo-chat's clock, since `viewer_next_nudge_at` is its time: a fast laptop would re-enable Nudge
  // early, and the press would only be refused. Re-read every 15s, so Nudge is back within that.
  const now = useServerNow();

  if (!room || !viewerId || !presence?.opponentUserId || !showsWaitingStatus(presence.state)) return null;
  const opponentUserId = presence.opponentUserId;

  const late = Boolean(presence.opponentLate);
  // Not after they came and went: the pill above already says they left.
  const heading = late || presence.state === 'left' ? null : COPY.heading(opponentName);
  const timeline = roomWaitingTimeline(room, opponentUserId, viewerId);
  const seen = opponentPresence(room, opponentUserId);
  const lastOnline = seen?.last_online_at ? minutesSince(seen.last_online_at, now) : null;
  const presenceLine = seen?.online ? COPY.online : lastOnline !== null ? COPY.lastOnline(COPY.ago(lastOnline)) : null;

  return (
    <div
      data-testid="room-waiting-status"
      className="mx-auto mb-3 flex w-full max-w-[560px] flex-col gap-3.5 rounded-lg border border-grey-02 bg-white px-5 py-4 mobile:px-4"
    >
      {(heading || presenceLine) && (
        <div className="flex flex-col gap-1.5">
          {heading && (
            <Text as="p" variant="metadataMedium">
              {heading}
            </Text>
          )}
          {presenceLine && (
            <p className="flex items-center gap-2">
              <span
                aria-hidden
                className={cx('size-2 shrink-0 rounded-full', seen?.online ? 'bg-green' : 'bg-grey-03')}
              />
              <Text as="span" variant="footnote" color="grey-04">
                {presenceLine}
              </Text>
            </p>
          )}
        </div>
      )}
      {timeline.length > 0 && (
        <ol
          aria-label={COPY.timelineLabel(opponentName)}
          className={cx('flex flex-col gap-2', (heading || presenceLine) && 'border-t border-grey-02 pt-3')}
        >
          {timeline.map(entry => (
            <li key={`${entry.kind}:${entry.at}`} className="flex gap-3">
              <Text as="span" variant="footnote" color="grey-04" className="w-16 shrink-0 tabular-nums">
                {formatTime(entry.at)}
              </Text>
              <Text
                as="span"
                variant={entry.kind === 'running_late' ? 'footnoteMedium' : 'footnote'}
                color={entry.kind === 'running_late' ? 'text' : 'grey-04'}
              >
                {entryText(entry, opponentName, viewerName)}
              </Text>
            </li>
          ))}
        </ol>
      )}
      {/* Running late leaves nothing to do here: the late notice has Reschedule. */}
      {!late && (
        <div className="flex flex-wrap items-center gap-2 border-t border-grey-02 pt-3">
          <NudgeButton room={room} viewerId={viewerId} now={now} opponentName={opponentName} />
          <span className="flex-1" />
          <RoomRescheduleButton
            opponentName={opponentName}
            opponentUserId={opponentUserId}
            analyticsAction="Waiting status reschedule"
            entry="room_waiting_status"
          />
        </div>
      )}
    </div>
  );
}

function entryText(entry: RoomWaitingEntry, name: string, viewerName: string | null): string {
  switch (entry.kind) {
    case 'room_open':
      return COPY.roomOpen(name);
    case 'opponent_waiting':
      return COPY.opponentWaiting(name, viewerName);
    case 'nudged':
      return COPY.nudged(name, entry.channel);
    case 'running_late':
      return COPY.runningLate(name);
  }
}

/**
 * Nudge, then "Nudged" until geo-chat's next time (15 minutes, or never after the second), read on
 * the card's server clock. No copy under it, Preston's call. A refusal that means the room moved on
 * says so in a line beside it.
 */
function NudgeButton({
  room,
  viewerId,
  now,
  opponentName,
}: {
  room: DebateRoomView;
  viewerId: string;
  now: number;
  opponentName: string;
}) {
  const nudge = useNudgeDebateRoom(room.room_id);
  const state = nudgeButtonState(room, viewerId, now, nudge.data);
  // Refused for good: nothing was recorded, so the room still says ready, but a retry cannot help.
  const unreachable =
    nudge.error instanceof GeoChatRequestError &&
    (nudge.error.code === 'cant_reach' || nudge.error.code === 'nudge_forbidden');

  if (state === 'hidden') return null;
  const refusal = refusalText(nudge.error, opponentName);
  return (
    <>
      <HubPillButton
        variant={state === 'ready' ? 'primary' : 'secondary'}
        disabled={state !== 'ready' || nudge.isPending || unreachable}
        pending={nudge.isPending}
        pendingLabel={COPY.nudging}
        analyticsLabel={debateAnalyticsLabel('room', 'Waiting status nudge')}
        analyticsIntent="nudge_scheduled_debate"
        onClick={() => nudge.mutate()}
      >
        {state === 'nudged' ? COPY.nudgedDone : COPY.nudge}
      </HubPillButton>
      {refusal && (
        <span role="status">
          <Text as="span" variant="footnote" color="grey-04">
            {refusal}
          </Text>
        </span>
      )}
    </>
  );
}

function refusalText(error: unknown, name: string): string | null {
  if (!error) return null;
  if (error instanceof GeoChatRequestError) {
    // The button already says Nudged for these; the room refetch has caught up.
    if (error.code === 'nudge_too_soon' || error.code === 'nudge_limit') return null;
    if (error.code === 'already_here') return COPY.nudgeRefused.already_here(name);
    if (error.code === 'running_late') return COPY.nudgeRefused.running_late(name);
    if (error.code === 'cant_reach') return COPY.nudgeRefused.cant_reach(name);
    if (error.code === 'nudge_forbidden') return COPY.nudgeRefused.forbidden;
  }
  return COPY.nudgeRefused.other(name);
}
