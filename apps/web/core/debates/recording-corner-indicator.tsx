'use client';

import * as React from 'react';

import { RoomExit } from './debate-room-stamps';
import { RecordingCountdownRing, type RecordingCountdownRingProps } from './recording-countdown-ring';

/** One persistent badge: ending a turn changes its contents, rather than overlapping two discs. */
export function RecordingCornerIndicator({
  countdown,
  muted,
  participant,
}: {
  countdown?: React.ReactElement<RecordingCountdownRingProps> | null;
  muted: boolean;
  participant: 'local' | 'remote';
}) {
  // Keep the last timer's geometry while its contents settle into the microphone. A later turn
  // supplies fresh props without remounting the badge, including if an End turn request fails.
  const [lastCountdown, setLastCountdown] = React.useState(countdown);
  if (countdown && countdown !== lastCountdown) setLastCountdown(countdown);
  const timer = countdown ?? lastCountdown;

  return (
    <div
      data-inactive-speaker={participant}
      data-visible={muted ? 'true' : 'false'}
      className="pointer-events-none absolute top-[2.4cqw] right-[2.4cqw] z-20"
    >
      <RoomExit layout="inline" crossfade>
        {(countdown || muted) && (
          <RecordingCountdownRing
            remainingSeconds={0}
            progress={0}
            variant="default"
            {...timer?.props}
            openRounds
            presentation={muted ? 'microphone' : 'timer'}
          />
        )}
      </RoomExit>
    </div>
  );
}
