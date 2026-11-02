'use client';

import * as React from 'react';

import cx from 'classnames';
import { MotionConfig, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { Text } from '~/design-system/text';

import { ThreadAvatar } from '~/partials/comments/thread-avatar';

import type { UpcomingDebateRoom } from '../api';
import { routeIntoDebate } from '../lobbies/step-out';
import { debateActionAnalyticsAttributes } from '../matchmaking/hub-analytics';
import { useServerNow } from '../matchmaking/use-request-countdown';
import { LOBBY_JOIN_PROMPT, ROOM_JOIN_PROMPT } from './room-copy';
import { opponentName, useUpcomingRoomOpponent, useUpcomingRoomRequest } from './room-opponent';
import { debateRoomPath } from './room-routes';
import { startOffset } from './room-time';
import type { ScheduledNoticeStep } from './scheduled-notice';

/** The banner's Running late or Can't make it: which screen, on the request that booked the room. */
export type RoomJoinPromptNotice = { requestId: string; step: ScheduledNoticeStep };

/** A booked debate's way to tell the other debater something instead of joining (GEO-3427). */
const NOTICE_ACTIONS = [
  { step: 'late', label: ROOM_JOIN_PROMPT.late, analytics: 'Running late', intent: 'open_running_late' },
  { step: 'cant', label: ROOM_JOIN_PROMPT.cant, analytics: 'Cant make it', intent: 'open_cant_make_it' },
] as const;

/**
 * The banner's own pill, shared by all its buttons. Taller than the hub's `h-7` pill, which would
 * resize the lobby banner's Join and Not now.
 */
const PILL_CLASS = 'shrink-0 rounded-full px-3 py-1.5 text-metadata';

/**
 * The offer to join a scheduled debate (GEO-2941), never a redirect. Shown at the top of whatever
 * page the viewer is on once the room opens. Whether the opponent is in comes from the server's
 * `others_present`, so this and the Requests tab (GEO-2940) cannot disagree.
 *
 * A booked debate's banner has no Not now (GEO-3430). Hiding it on one device told the person waiting
 * nothing, so the only ways out are Join, Running late and Can't make it, and the last two close it
 * only once the other debater has been told. A reminded lobby keeps Not now: nobody is waiting on it.
 *
 * `onNotice` hands those two to the coordinator, which owns their dialog: a cancel drops the room from
 * the list, and a dialog drawn by this banner would vanish with it before saying it had worked.
 */
export function DebateRoomJoinPrompt({
  room,
  onDismiss,
  onNotice,
}: {
  room: UpcomingDebateRoom;
  /** A reminded lobby's Not now. */
  onDismiss: () => void;
  onNotice: (notice: RoomJoinPromptNotice) => void;
}) {
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();
  const opponent = useUpcomingRoomOpponent(room);
  const request = useUpcomingRoomRequest(room);
  // Minute-grained copy, so the default quarter-minute tick is never more than 15s stale.
  const now = useServerNow();

  const name = opponentName(opponent);
  const schedule = scheduleLabel(new Date(room.starts_at).getTime() - now);
  const isLobby = room.kind === 'lobby';

  return (
    <div className="pointer-events-none fixed top-[calc(2.75rem+0.75rem)] left-1/2 z-1100 flex w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 justify-center">
      {/* Scoped rather than global, as the hub does: `user` keeps the fade and drops the slide. */}
      <MotionConfig reducedMotion="user">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cx(
            'pointer-events-auto flex w-full gap-3 rounded-lg border border-grey-02 bg-white p-3 shadow-card',
            isLobby ? 'items-center md:flex-wrap' : 'flex-col'
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Framed, not a bare `Avatar`: a real photo fills whatever box it is given, and an unsized
              one drew the opponent's profile photo at full resolution across the page. */}
            <ThreadAvatar
              avatarUrl={opponent?.avatar_cid}
              value={opponent?.profile_space_id || room.room_id}
              sizePx={36}
            />
            <div className="min-w-0 flex-1">
              {/* Only what changes on an event is announced. The time line below re-renders every
                minute, and inside the live region it would be read out every minute. */}
              <div role="status" aria-live="polite">
                <Text as="p" variant="metadataMedium" className="truncate">
                  {isLobby ? LOBBY_JOIN_PROMPT.title(room.name) : ROOM_JOIN_PROMPT.title}
                </Text>
                {isLobby ? (
                  <Text as="p" variant="footnote" color="grey-04" className="mt-0.5 truncate">
                    {LOBBY_JOIN_PROMPT.subtitle}
                  </Text>
                ) : (
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cx('size-2 shrink-0 rounded-full', room.others_present ? 'bg-green' : 'bg-grey-03')}
                    />
                    <Text
                      as="span"
                      variant="footnoteMedium"
                      color={room.others_present ? 'text' : 'grey-04'}
                      className="truncate"
                    >
                      {room.others_present
                        ? ROOM_JOIN_PROMPT.opponentJoined(name)
                        : ROOM_JOIN_PROMPT.opponentNotJoined(name)}
                    </Text>
                  </p>
                )}
              </div>
              {schedule && (
                <Text as="p" variant="footnote" color="grey-04" className="mt-0.5 truncate">
                  {schedule}
                </Text>
              )}
            </div>
          </div>
          <div
            className={cx(
              'flex gap-2',
              isLobby
                ? 'shrink-0 items-center md:w-full md:justify-end'
                : // Board 5: Join leads on a phone, full width over the other two.
                  'flex-wrap justify-end md:grid md:grid-cols-2'
            )}
          >
            {isLobby ? (
              <button
                type="button"
                {...debateActionAnalyticsAttributes('room-join-prompt', 'Not now', 'dismiss_scheduled_debate_prompt')}
                onClick={onDismiss}
                className={cx(PILL_CLASS, 'text-grey-04 hover:bg-grey-01')}
              >
                {LOBBY_JOIN_PROMPT.notNow}
              </button>
            ) : (
              NOTICE_ACTIONS.map(action => (
                <button
                  key={action.step}
                  type="button"
                  // Until the request that booked the room is read there is no debate to name.
                  disabled={!request}
                  {...debateActionAnalyticsAttributes('room-join-prompt', action.analytics, action.intent)}
                  onClick={() => request && onNotice({ requestId: request.request_id, step: action.step })}
                  className={cx(
                    PILL_CLASS,
                    'border border-grey-02 bg-white text-text transition-colors hover:bg-grey-01 disabled:opacity-50 md:h-11'
                  )}
                >
                  {action.label}
                </button>
              ))
            )}
            <button
              type="button"
              disabled={joining}
              {...debateActionAnalyticsAttributes('room-join-prompt', 'Join', 'join_scheduled_debate')}
              onClick={() => {
                setJoining(true);
                const go = () => startJoining(() => router.push(debateRoomPath(room.room_id)));
                // Moving to another lobby is a normal leave, not a step-out.
                if (isLobby) go();
                else routeIntoDebate(go);
              }}
              className={cx(
                PILL_CLASS,
                'bg-text text-white transition-opacity hover:opacity-90 disabled:opacity-70',
                !isLobby && 'md:-order-1 md:col-span-2 md:h-11'
              )}
            >
              {joining ? 'Joining…' : isLobby ? LOBBY_JOIN_PROMPT.join : ROOM_JOIN_PROMPT.join}
            </button>
          </div>
        </motion.div>
      </MotionConfig>
    </div>
  );
}

/** Minutes to the start, or since it, as the prompt says them. See `startOffset` for the rounding. */
export function scheduleLabel(untilStartMs: number): string | null {
  const offset = startOffset(untilStartMs);
  if (offset === null) return null;
  if (offset === 'now') return ROOM_JOIN_PROMPT.startingNow;
  return 'in' in offset ? ROOM_JOIN_PROMPT.scheduledIn(offset.in) : ROOM_JOIN_PROMPT.scheduledAgo(offset.ago);
}
