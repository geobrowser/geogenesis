'use client';

import { useAudioPlayback } from '@livekit/components-react';

import * as React from 'react';

import type { Room } from 'livekit-client';

import { Text } from '~/design-system/text';

import { DebateRoomNotice, DebateRoomNoticeAction } from './debate-room-notice';

/**
 * Asks for the click the browser's autoplay policy wants before it plays the opponent's audio, as
 * the claim picker and lobby voice do. A page reload loses the gesture the intro supplied, and
 * without this the room stays silent with nothing to press. `startAudio()` must run from that click.
 */
export function DebateAudioBlockedNotice({ room, openRoundsStyle }: { room: Room; openRoundsStyle: boolean }) {
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  if (canPlayAudio) return null;
  const action = (
    <DebateRoomNoticeAction appearance={openRoundsStyle ? 'glass' : 'default'} onClick={() => void startAudio()}>
      Enable audio
    </DebateRoomNoticeAction>
  );
  if (openRoundsStyle) return <DebateRoomNotice actions={action}>Audio is blocked</DebateRoomNotice>;
  return (
    <div
      role="status"
      className="mt-3 flex w-full max-w-[430px] flex-wrap items-center justify-between gap-3 rounded-lg border border-grey-02 bg-white px-4 py-3"
    >
      <Text>Audio is blocked</Text>
      {action}
    </div>
  );
}
