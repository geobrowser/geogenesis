'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { UpcomingDebateRoom } from '../api';
import { useServerClock } from '../matchmaking/use-request-countdown';
import { ROOM_JOIN_PROMPT } from './room-copy';
import { opponentName, useUpcomingRoomOpponent } from './room-opponent';
import { debateRoomPath } from './room-routes';

const MINUTE_MS = 60_000;
/** Minute-grained copy, so a quarter-minute tick is never more than 15s stale. */
const TICK_MS = 15_000;

/**
 * The offer to join a scheduled debate (GEO-2941), never a redirect. Shown at the top of whatever
 * page the viewer is on once the room opens. Whether the opponent is in comes from the server's
 * `others_present`, so this and the Requests tab (GEO-2940) cannot disagree.
 */
export function DebateRoomJoinPrompt({ room, onNotNow }: { room: UpcomingDebateRoom; onNotNow: () => void }) {
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();
  const opponent = useUpcomingRoomOpponent(room);
  const now = useNow();

  const name = opponentName(opponent);
  const schedule = scheduleLabel(new Date(room.starts_at).getTime() - now);

  return (
    <div className="pointer-events-none fixed top-[calc(2.75rem+0.75rem)] left-1/2 z-1100 flex w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 justify-center">
      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 shadow-card md:flex-wrap"
      >
        <div className="shrink-0">
          <Avatar
            avatarUrl={opponent?.avatar_cid}
            value={opponent?.profile_space_id || room.room_id}
            size={36}
            alt={name}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Text as="p" variant="metadataMedium" className="truncate">
            {ROOM_JOIN_PROMPT.title}
          </Text>
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
              {room.others_present ? ROOM_JOIN_PROMPT.opponentJoined(name) : ROOM_JOIN_PROMPT.opponentNotJoined(name)}
            </Text>
          </p>
          {schedule && (
            <Text as="p" variant="footnote" color="grey-04" className="mt-0.5 truncate">
              {schedule}
            </Text>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 md:w-full md:justify-end">
          <button
            type="button"
            onClick={onNotNow}
            className="shrink-0 rounded-full px-3 py-1.5 text-metadata text-grey-04 hover:bg-grey-01"
          >
            {ROOM_JOIN_PROMPT.notNow}
          </button>
          <button
            type="button"
            disabled={joining}
            onClick={() => {
              setJoining(true);
              startJoining(() => router.push(debateRoomPath(room.room_id)));
            }}
            className="shrink-0 rounded-full bg-text px-3 py-1.5 text-metadata text-white transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            {joining ? 'Joining…' : ROOM_JOIN_PROMPT.join}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/**
 * Minutes to the start, or since it. The first minute either side reads as starting now rather than
 * "in 0 mins" or "0 mins ago". `null` for an unparseable start, which has nothing honest to say.
 */
export function scheduleLabel(untilStartMs: number): string | null {
  if (!Number.isFinite(untilStartMs)) return null;
  if (untilStartMs > 0) return ROOM_JOIN_PROMPT.scheduledIn(Math.ceil(untilStartMs / MINUTE_MS));
  const elapsedMinutes = Math.floor(-untilStartMs / MINUTE_MS);
  return elapsedMinutes < 1 ? ROOM_JOIN_PROMPT.startingNow : ROOM_JOIN_PROMPT.scheduledAgo(elapsedMinutes);
}

/** The server's clock where it has synced, so a skewed laptop does not misreport the start. */
function useNow() {
  const clock = useServerClock();
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const read = () => (clock ? clock.now() : Date.now());
    setNow(read());
    const interval = setInterval(() => setNow(read()), TICK_MS);
    return () => clearInterval(interval);
  }, [clock]);

  return now;
}
