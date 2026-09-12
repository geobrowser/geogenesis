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
 * The translucent fill the tile chips share.
 *
 * 85% rather than the 60% these started at, and that is a contrast requirement rather than taste.
 * The chip composites over whatever the camera is pointed at, so its effective background is a
 * range, and the floor of that range — 60% white over a black frame — is `#999`. Chip text is
 * 12px, which WCAG counts as body text at 4.5:1, and against `#999` the recording red measures
 * 3.02:1. No red that still reads as red clears 4.5:1 there; the value that does is around
 * `#660B00`, which reads as brown. Taking the fill to 85% fixes the background instead: the range
 * narrows to `#d9d9d9`–`#fff`, where the red measures 6.1:1 at worst and the dark text 11.5:1.
 *
 * A constant rather than a default inside `DebateTileChip`, because `cx` concatenates and does not
 * merge — a caller passing `bg-green` would emit both classes and let stylesheet order decide.
 */
export const tileChipSurface = 'bg-white/85';

/**
 * The chip every small label overlaid on a tile wears: the position label, the recording
 * indicator, the intro screen's readiness badges, and the playback feed's speaker label. They sit
 * at the same optical size, so the geometry lives here once and callers bring only the fill and
 * the text colour.
 */
export function DebateTileChip({
  className,
  children,
  ...spanProps
}: React.ComponentPropsWithoutRef<'span'> & { className?: string }) {
  return (
    <span
      {...spanProps}
      className={cx(
        'inline-flex h-4 items-center gap-1 rounded-full px-1.5 text-[0.75rem] leading-none whitespace-nowrap',
        className
      )}
    >
      {children}
    </span>
  );
}

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
  tileControls,
  status,
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
  /** The middle of the bottom row. The intro screen puts your mic and camera here. */
  tileControls?: React.ReactNode;
  /**
   * Bottom-right: where this tile says how its own speaker stands. Yours carries the recording
   * indicator, theirs their readiness on the intro screen — one place to look per person, rather
   * than a different corner per fact. Deliberately the same slot on both screens and both tiles,
   * so nothing the debate does later can displace it.
   */
  status?: React.ReactNode;
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

      {/* One row rather than three corners. Everything that wants the bottom of the tile is laid
          out here instead of absolutely positioned, so nothing can end up underneath anything else.
          The label is the only flexible cell: the controls and the status hold their natural width
          and the label truncates to pay for them. Giving the status a share of the free space
          instead — `flex-1` with a zero basis — sized it to the viewport rather than to its own
          text, and the wider "Not recording" state then overflowed onto the camera toggle on any
          tile under ~330px, which is most phones. */}
      {(positionLabel || tileControls || status) && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 justify-start">
            {positionLabel && (
              <DebateTileChip className={cx('max-w-full truncate text-text', tileChipSurface)}>
                {positionLabel}
              </DebateTileChip>
            )}
          </div>
          {tileControls && <div className="pointer-events-auto shrink-0">{tileControls}</div>}
          <div className="flex shrink-0 justify-end">{status}</div>
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
