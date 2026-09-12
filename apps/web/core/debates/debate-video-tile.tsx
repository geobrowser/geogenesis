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
 * One participant's tile, shared by the intro screen and the recording modal so the two have the
 * same geometry. Everything past the video is optional: the intro passes a label and an overlay,
 * the debate adds turn countdowns and phase overlays.
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
  tileLabel,
  showMutedIndicator = false,
  countdown,
  closingMessage = false,
  badge,
  badgeAlign = 'left',
  tileControls,
  recordingStatus,
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
  /** Names the tile for assistive technology — otherwise both are unlabelled `section`s. */
  tileLabel?: string;
  showMutedIndicator?: boolean;
  countdown?: React.ReactNode;
  closingMessage?: boolean;
  /** Top chip. The intro screen puts the opponent's readiness here. */
  badge?: React.ReactNode;
  /**
   * Which top corner the badge takes. `left` by default because the debate room spends the right
   * one on the turn countdown and the muted indicator; the intro screen, which has neither, puts
   * the opponent's readiness on the right as the design has it.
   */
  badgeAlign?: 'left' | 'right';
  /**
   * The middle of the tile's bottom row. The intro screen puts your mic and camera here. It sits
   * between the other two slots rather than at the tile's centre, so a long position label or the
   * wider "Not recording" state shifts it a little either way.
   */
  tileControls?: React.ReactNode;
  /**
   * Bottom-right. Reserved for the recording indicator on both screens, so the one thing that has
   * to be findable in the same place throughout is never displaced by a phase overlay.
   */
  recordingStatus?: React.ReactNode;
  children: React.ReactNode;
}) {
  const showInactiveIndicator =
    showMutedIndicator || (inactive && !revealInactive && !countdown && !overlayText && !endingTurn);

  return (
    <section
      aria-label={tileLabel}
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
      {/* Top-left by default: the muted indicator and the turn countdown both own the right
          corner, and "muted and ready" is a very ordinary combination. */}
      {badge && <div className={cx('absolute top-3 z-30', badgeAlign === 'right' ? 'right-3' : 'left-3')}>{badge}</div>}

      {/* One row rather than three corners. The position label, the intro's mic and camera, and the
          recording indicator all want the bottom of the tile, and a tile is only ~270px wide in the
          intro's two-column layout — absolutely positioning each to its own corner had the
          indicator sitting on top of the camera button there. */}
      {(positionLabel || tileControls || recordingStatus) && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 justify-start">
            {positionLabel && (
              <span className="inline-flex h-4 max-w-full items-center truncate rounded-full bg-white/60 px-1.5 text-[0.75rem] leading-none text-text">
                {positionLabel}
              </span>
            )}
          </div>
          {tileControls && <div className="pointer-events-auto shrink-0">{tileControls}</div>}
          <div className="flex flex-1 shrink-0 justify-end">{recordingStatus}</div>
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
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
        >
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
