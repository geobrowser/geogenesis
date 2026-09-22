'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { roomPresenceLabel, roomPresenceNote } from './room-copy';
import type { DebateRoomPresence, DebateRoomPresenceState } from './room-presence';

/**
 * Who else is in the room (GEO-2941). Small, because a room is the debate-again page rather than a
 * screen of its own, and the states describe without ever navigating.
 *
 * No avatar: the room payload carries bare user ids, and nothing on the client resolves one to a
 * profile. `opponentName` falls back to a generic label until geo-chat sends participant summaries.
 */
export function DebateRoomPresenceIndicator({
  presence,
  opponentName = 'Your opponent',
}: {
  presence: DebateRoomPresence;
  opponentName?: string;
}) {
  const note = roomPresenceNote(presence.state, opponentName);

  return (
    <div
      role="status"
      aria-live="polite"
      // In the picker's own sticky header rather than floating over it. A fixed overlay sat on the
      // tab strip and the leave button — including in the three states whose note tells the viewer
      // to go and find someone else.
      className="mb-3 flex flex-col items-center gap-2"
      data-room-presence={presence.state}
    >
      <div className="flex max-w-full items-center gap-2 rounded-full border border-grey-02 bg-white py-1.5 pr-3 pl-3">
        <PresenceDot state={presence.state} />
        <Text as="span" variant="metadata" className="truncate">
          {roomPresenceLabel(presence.state, opponentName)}
        </Text>
      </div>

      {note && (
        <div className="max-w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-center">
          <Text as="p" variant="footnote" color="grey-04">
            {note}
          </Text>
        </div>
      )}
    </div>
  );
}

/** Colour is never the only thing carrying the state; the label says it too. */
function PresenceDot({ state }: { state: DebateRoomPresenceState }) {
  const tone: Record<DebateRoomPresenceState, string> = {
    arrived_early: 'bg-grey-03',
    waiting: 'bg-orange animate-pulse',
    waiting_elsewhere: 'bg-orange animate-pulse',
    present: 'bg-green',
    left: 'bg-grey-04',
    no_show: 'bg-grey-04',
  };

  return <span aria-hidden className={cx('size-2 shrink-0 rounded-full', tone[state])} />;
}
