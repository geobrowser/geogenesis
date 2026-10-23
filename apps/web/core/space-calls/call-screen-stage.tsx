'use client';

import * as React from 'react';

import type { DebateLobbyMember } from '~/core/debates/api';
import { personName } from '~/core/debates/lobbies/lobby-format';
import { useLobbyVoiceStates } from '~/core/debates/lobbies/lobby-voice';
import { sameId } from '~/core/debates/rooms/room-presence';
import { TrackVideo } from '~/core/debates/track-video';

import { Fullscreen } from '~/design-system/icons/full-screen';
import { Text } from '~/design-system/text';

export const CALL_SCREEN_COPY = {
  sharing: (name: string) => `${name} is sharing their screen`,
  fullscreen: 'Full screen',
} as const;

/**
 * A shared screen gets the big tile above the speakers (GEO-3419). With more than one, the last
 * one LiveKit lists is shown; the others show once it stops.
 */
export function CallScreenStage({ members }: { members: readonly DebateLobbyMember[] }) {
  const { screens } = useLobbyVoiceStates();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const shares = screens ? [...screens.entries()] : [];
  if (shares.length === 0) return null;

  const [sharerId, track] = shares[shares.length - 1]!;
  const sharer = members.find(member => sameId(member.user_id, sharerId));
  const label = CALL_SCREEN_COPY.sharing(sharer ? personName(sharer) : 'Someone');
  // Phones' Safari has no element full screen; the tile is already the page's width there.
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  return (
    <section aria-label={label} className="flex flex-col gap-2" data-testid="call-screen-stage">
      <div ref={frameRef} className="relative aspect-video w-full overflow-hidden rounded-xl bg-text">
        <TrackVideo track={track.publication.track} fit="contain" data-testid="call-screen-video" />
        {canFullscreen ? (
          <button
            type="button"
            onClick={() => void frameRef.current?.requestFullscreen().catch(() => undefined)}
            className="absolute top-3 right-3 flex items-center gap-1 rounded-md bg-text/70 px-2 py-1.5 text-metadataMedium text-white"
          >
            <Fullscreen color="white" />
            {CALL_SCREEN_COPY.fullscreen}
          </button>
        ) : null}
      </div>
      <Text as="p" variant="footnote" color="grey-04">
        {label}
      </Text>
    </section>
  );
}
