'use client';

import * as React from 'react';

import cx from 'classnames';

import { Avatar } from '~/design-system/avatar';
import { Text } from '~/design-system/text';

import { speakerLabel } from '../playback-utils';
import { roomPresenceLabel, roomPresenceNote } from './room-copy';
import type { DebateRoomPresence, DebateRoomPresenceState } from './room-presence';

/**
 * Who else is in the room (GEO-2941). Small, because a room is the debate-again page rather than a
 * screen of its own, and the states describe without ever navigating.
 */
export function DebateRoomPresenceIndicator({ presence }: { presence: DebateRoomPresence }) {
  const name = speakerLabel(presence.opponent);
  const note = roomPresenceNote(presence.state, name);

  return (
    <div
      role="status"
      aria-live="polite"
      // Above the picker's own `fixed inset-0 z-[150]` overlay, below the app-wide dialogs at
      // z-1100 — a room must not cover a popup telling the viewer something about it.
      className="pointer-events-none fixed top-3 left-1/2 z-[200] flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2"
      data-room-presence={presence.state}
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-grey-02 bg-white py-1.5 pr-3 pl-1.5 shadow-card">
        <div className="size-6 shrink-0 overflow-hidden rounded-full">
          <Avatar
            avatarUrl={presence.opponent.avatar_cid}
            value={presence.opponent.profile_space_id}
            alt=""
            size={24}
          />
        </div>
        <PresenceDot state={presence.state} />
        <Text as="span" variant="metadata" className="truncate">
          {roomPresenceLabel(presence.state, name)}
        </Text>
      </div>

      {note && (
        <div className="pointer-events-auto max-w-full rounded-lg border border-grey-02 bg-white px-3 py-2 text-center shadow-card">
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
