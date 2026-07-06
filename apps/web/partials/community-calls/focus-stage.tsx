'use client';

import { ParticipantTile, TrackReferenceOrPlaceholder, TrackToggle } from '@livekit/components-react';

import * as React from 'react';

import { Track } from 'livekit-client';
import { createPortal } from 'react-dom';

import { CloseSmall } from '~/design-system/icons/close-small';
import { Fullscreen } from '~/design-system/icons/full-screen';

type Props = {
  tracks: TrackReferenceOrPlaceholder[];
  isViewer: boolean;
  onLeave: () => void;
};

/**
 * "Focus mode" — a large main-stage tile (screen share always wins focus) plus a
 * scrollable sidebar strip of the other participants. Swapped in automatically
 * whenever a screen share is active.
 *
 * Manual fullscreen is a separate CSS-portal overlay (not the browser Fullscreen
 * API) toggled from a button on the main tile, and auto-exits if the focused track
 * stops being a screen share (e.g. the presenter stops sharing).
 */
export function FocusStage({ tracks, isViewer, onLeave }: Props) {
  const [isScreenShareFullscreen, setIsScreenShareFullscreen] = React.useState(false);

  const focusTrack = tracks.find(t => t.source === Track.Source.ScreenShare) ?? tracks[0];
  const sideTracks = tracks.filter(t => t !== focusTrack);
  const isFocusedScreenShare = focusTrack?.source === Track.Source.ScreenShare;

  React.useEffect(() => {
    if (!isFocusedScreenShare && isScreenShareFullscreen) {
      setIsScreenShareFullscreen(false);
    }
  }, [isFocusedScreenShare, isScreenShareFullscreen]);

  if (!focusTrack) return null;

  if (isScreenShareFullscreen && isFocusedScreenShare) {
    return createPortal(
      <div className="fixed inset-0 z-100 bg-black">
        <ParticipantTile trackRef={focusTrack} className="h-full" />
        <FullscreenToggleButton isFullscreen onClick={() => setIsScreenShareFullscreen(false)} />
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-white p-1 shadow-[0_4px_25px_rgba(0,0,0,0.25)]">
          {!isViewer && (
            <>
              <TrackToggle source={Track.Source.Microphone} />
              <TrackToggle source={Track.Source.Camera} />
            </>
          )}
          <button onClick={onLeave} className="rounded-md bg-red-01 px-3 py-2 text-metadataMedium text-white">
            Leave
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-2">
      <div className="relative min-h-0 min-w-0 flex-1">
        <ParticipantTile trackRef={focusTrack} className="h-full" />
        {isFocusedScreenShare && (
          <FullscreenToggleButton isFullscreen={false} onClick={() => setIsScreenShareFullscreen(true)} />
        )}
      </div>
      {sideTracks.length > 0 && (
        <div className="flex w-[180px] shrink-0 flex-col gap-2 overflow-y-auto">
          {sideTracks.map(t => (
            <div key={`${t.participant.identity}-${t.source}`} className="aspect-video shrink-0">
              <ParticipantTile trackRef={t} className="h-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FullscreenToggleButton({ isFullscreen, onClick }: { isFullscreen: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={isFullscreen ? 'Exit screen share fullscreen' : 'Enter screen share fullscreen'}
      className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-md bg-text/70 px-2 py-1.5 text-metadataMedium text-white"
    >
      {isFullscreen ? <CloseSmall color="white" /> : <Fullscreen color="white" />}
      {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    </button>
  );
}
