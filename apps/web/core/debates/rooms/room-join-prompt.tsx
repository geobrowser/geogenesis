'use client';

import * as React from 'react';

import { useRouter } from 'next/navigation';

import { Text } from '~/design-system/text';

import type { UpcomingDebateRoom } from '../api';
import { ROOM_JOIN_PROMPT } from './room-copy';
import { debateRoomPath } from './room-routes';

/**
 * The offer to join a scheduled debate (GEO-2941), never a redirect. Urgency comes from the
 * server's `due` and `others_present`, so this and the Requests tab (GEO-2940) cannot disagree.
 */
export function DebateRoomJoinPrompt({ room, onNotNow }: { room: UpcomingDebateRoom; onNotNow: () => void }) {
  const router = useRouter();
  const [joining, setJoining] = React.useState(false);
  const [, startJoining] = React.useTransition();

  const message = room.others_present
    ? ROOM_JOIN_PROMPT.waitingNow
    : room.due
      ? ROOM_JOIN_PROMPT.startingNow
      : ROOM_JOIN_PROMPT.scheduled(formatTime(room.starts_at));

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-1100 flex w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 justify-center">
      <div className="pointer-events-auto flex w-full items-center gap-3 rounded-lg border border-grey-02 bg-white p-3 shadow-card">
        <div className="min-w-0 flex-1">
          <Text as="p" variant="metadataMedium" className="truncate">
            {ROOM_JOIN_PROMPT.title}
          </Text>
          <Text as="p" variant="footnote" color="grey-04" className="truncate">
            {message}
          </Text>
        </div>
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
    </div>
  );
}

function formatTime(iso: string) {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? 'the scheduled time'
    : at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
