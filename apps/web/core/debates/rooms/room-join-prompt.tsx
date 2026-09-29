'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import type { UpcomingDebateRoom } from '../api';
import { useRequestCountdown } from '../matchmaking/use-request-countdown';
import { ROOM_JOIN_PROMPT } from './room-copy';
import { useUpcomingRoomOpponent } from './room-opponent';
import { debateRoomPath } from './room-routes';

const MINUTE_MS = 60_000;

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
  const { remainingMs } = useRequestCountdown(room.starts_at);

  const opponentName = opponent?.display_name || ROOM_JOIN_PROMPT.unnamedOpponent;
  const starting = room.due || remainingMs <= 0;
  const when = starting
    ? ROOM_JOIN_PROMPT.startingNow
    : ROOM_JOIN_PROMPT.startsAt(
        formatTime(room.starts_at),
        Number.isFinite(remainingMs) ? `${Math.ceil(remainingMs / MINUTE_MS)} min` : null
      );

  return (
    <div className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+3.5rem)] left-1/2 z-1100 flex w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 justify-center">
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
            alt={opponentName}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Text as="p" variant="metadataMedium" className="truncate">
            {ROOM_JOIN_PROMPT.title}
          </Text>
          <Text as="p" variant="footnote" color="grey-04" className="truncate">
            {ROOM_JOIN_PROMPT.opponent(opponentName)} · {when}
          </Text>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden
              className={cx('h-2 w-2 shrink-0 rounded-full', room.others_present ? 'bg-green' : 'bg-grey-03')}
            />
            <Text
              as="span"
              variant="footnoteMedium"
              color={room.others_present ? 'text' : 'grey-04'}
              className="truncate"
            >
              {room.others_present
                ? ROOM_JOIN_PROMPT.opponentJoined(opponentName)
                : ROOM_JOIN_PROMPT.opponentNotJoined(opponentName)}
            </Text>
          </p>
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

function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? 'the scheduled time'
    : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
