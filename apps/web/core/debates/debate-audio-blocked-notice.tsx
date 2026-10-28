'use client';

import { useAudioPlayback } from '@livekit/components-react';

import * as React from 'react';

import type { Room } from 'livekit-client';

import { Text } from '~/design-system/text';

import { DebateRoomNotice, DebateRoomNoticeAction } from './debate-room-notice';

/**
 * Shown while the browser's autoplay policy holds back the opponent's audio, e.g. after a reload.
 * `startAudio()` must run from the click.
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
