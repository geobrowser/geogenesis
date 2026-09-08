'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { MutedMicrophoneIndicator } from './debate-room-controls';

export const recordingOverlayTextShadow = {
  textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px #000',
};

// Label/phrase overlays in Figma are dark text with a white outline (the inverse of the big
// numbers and "GO!", which stay white-on-black via recordingOverlayTextShadow).
export const recordingLabelTextShadow = {
  textShadow: '-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, 0 4px 12px rgba(0,0,0,0.25)',
};

/**
 * One participant's tile. Shared by the pre-debate intro screen and the recording modal so the
 * two screens have the same geometry — GEO-2819 makes the intro a two-way call, and a tile that
 * changed shape at the boundary would read as the debate restarting.
 *
 * Everything past the video itself is optional: the intro passes a label and an overlay, the
 * debate adds turn countdowns and the phase overlays.
 */
export function DebateVideoTile({
  participantPosition,
  positionLabel,
  active,
  overlayText,
  overlayCompact = false,
  upcomingSeconds,
  upcomingLabel = "You're up in",
  showGo = false,
  showWrapItUp = false,
  showDebateEndsSoon = false,
  endingTurn = false,
  endTurnAction,
  inactive = false,
  revealInactive = false,
  inactiveIndicatorId,
  showMutedIndicator = false,
  countdown,
  closingMessage = false,
  badge,
  children,
}: {
  participantPosition: boolean | null;
  positionLabel: string | null;
  active: boolean;
  overlayText?: string | null;
  /** For overlays that are a sentence rather than a label: smaller, wrapped and centred. */
  overlayCompact?: boolean;
  upcomingSeconds?: number | null;
  upcomingLabel?: string;
  showGo?: boolean;
  showWrapItUp?: boolean;
  showDebateEndsSoon?: boolean;
  endingTurn?: boolean;
  endTurnAction?: React.ReactNode;
  inactive?: boolean;
  revealInactive?: boolean;
  inactiveIndicatorId: 'local' | 'remote';
  showMutedIndicator?: boolean;
  countdown?: React.ReactNode;
  closingMessage?: boolean;
  /** Top-right chip. The intro screen puts the opponent's readiness here. */
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showInactiveIndicator =
    showMutedIndicator || (inactive && !revealInactive && !countdown && !overlayText && !endingTurn);

  return (
    <section
      data-debate-video-position={participantPosition === null ? undefined : participantPosition ? 'yes' : 'no'}
      data-active-speaker={active ? 'true' : 'false'}
      className={cx(
        'relative aspect-[5/3] min-h-0 overflow-hidden rounded-lg bg-black shadow-card',
        active && 'outline-[3px] outline-offset-0 outline-purple'
      )}
    >
      <div className="absolute inset-0 z-0">{children}</div>
      {endTurnAction && <div className="absolute top-3 left-3 z-40">{endTurnAction}</div>}
      <div
        aria-hidden="true"
        data-inactive-speaker={inactiveIndicatorId}
        data-visible={showInactiveIndicator ? 'true' : 'false'}
        className={cx(
          'pointer-events-none absolute top-3 right-3 z-20',
          showInactiveIndicator ? 'opacity-100' : 'opacity-0'
        )}
      >
        {showInactiveIndicator && <MutedMicrophoneIndicator />}
      </div>
      {countdown && <div className="pointer-events-none absolute top-3 right-3 z-20">{countdown}</div>}
      {badge && <div className="absolute top-3 right-3 z-30">{badge}</div>}

      {positionLabel && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 inline-flex h-4 items-center rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none text-text">
          {positionLabel}
        </div>
      )}

      {closingMessage && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Nice debate!
          <br />
          Say thanks
        </div>
      )}

      {endingTurn && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Ending turn…
        </div>
      )}

      {upcomingSeconds !== null && upcomingSeconds !== undefined && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center text-center">
          <div className="text-recordingLabel text-text" style={recordingLabelTextShadow}>
            {upcomingLabel}
          </div>
          <div className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white" style={recordingOverlayTextShadow}>
            {upcomingSeconds}
          </div>
        </div>
      )}

      {showGo && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center text-center text-[7.5rem] leading-none font-bold text-white"
          style={recordingOverlayTextShadow}
        >
          GO!
        </div>
      )}

      {showWrapItUp && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Wrap it up!
        </div>
      )}

      {showDebateEndsSoon && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center px-4 text-center text-recordingLabel text-text"
          style={recordingLabelTextShadow}
        >
          Debate ends soon
        </div>
      )}

      {overlayText && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm">
          <Text
            color="white"
            variant={overlayCompact ? 'metadata' : 'bodySemibold'}
            className={cx(
              'max-w-full border border-white/40 bg-black/70 text-center shadow-light',
              // A sentence set at label size fills the tile and wraps into the pill's own radius.
              overlayCompact ? 'rounded-2xl px-3 py-1.5 text-balance' : 'rounded-full px-4 py-2'
            )}
          >
            {overlayText}
          </Text>
        </div>
      )}
    </section>
  );
}
