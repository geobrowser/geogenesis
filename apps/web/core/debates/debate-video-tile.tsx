'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import { MutedMicrophoneIndicator } from './debate-room-controls';

export const recordingOverlayTextShadow = {
  textShadow: '-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 3px 8px #000',
};

/**
 * The same outline, scaled for type that is small rather than enormous.
 *
 * `recordingOverlayTextShadow` is built for the 7.5rem count-in, where a 2px offset is a hairline
 * — about 1.7% of the glyph. On a 14px `+1` that same 2px is 14% of the glyph, which is thicker
 * than the strokes it is supposed to be outlining: the four copies meet in the middle, fill the
 * counter of the zero and the notch of the plus, and the number reads as a smudge.
 *
 * So it is 1px, and eight directions instead of four. At 2px the diagonals alone cover the gaps
 * between them; at 1px they do not, and a four-corner outline leaves the top, bottom and sides of
 * each stroke bare — which is the other way this reads as broken. Eight 1px copies make a solid
 * 1px halo. The soft shadow underneath is what separates it from a light frame.
 */
export const smallOverlayTextShadow = {
  textShadow:
    '-1px -1px 0 #000, 0 -1px 0 #000, 1px -1px 0 #000, 1px 0 0 #000, 1px 1px 0 #000, 0 1px 0 #000, -1px 1px 0 #000, -1px 0 0 #000, 0 1px 4px rgba(0,0,0,0.9)',
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

      {/* One row rather than three corners, so nothing can end up underneath anything else.
          `1fr auto 1fr` rather than a flex row: the controls belong on the tile's centre line, and
          grid gets them there by construction, because the two `1fr` columns are equal whatever
          their contents weigh. A flex row with `justify-between` centres the middle child only
          when its siblings happen to be the same width, and here they are not — the status chip
          runs to twice the position label, which pushed the mic and camera visibly to the right.

          The side columns hold their contents' natural width and the label truncates into
          whatever is left. Giving the status a share of the free space instead — `flex-1` with a
          zero basis — sized it to the viewport rather than to its own text, and the wider
          "Not recording" state then overflowed onto the camera toggle below ~330px.

          All three cells are always rendered: with two children the status would take the middle
          column and sit on the centre line itself.

          The status column is `minmax(auto,1fr)` rather than `1fr` so that centring degrades
          instead of breaking. Equal columns are what centre the controls, but they also starve the
          wider side: on a 254px tile — a 320px viewport — an equal share is 67px while
          "Not recording" needs 86, and being `whitespace-nowrap` it took the difference out of the
          middle column and sat on the camera toggle. An `auto` minimum lets that column claim its
          own width first, so the label gives up the space instead and truncates. Everywhere there
          is room for equal columns, which is every width from ~360px up, the two resolve equal and
          the controls land exactly on the centre line. */}
      {(positionLabel || tileControls || status) && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(auto,1fr)] items-center gap-2">
          <div className="flex min-w-0 justify-start">
            {positionLabel && (
              <DebateTileChip className={cx('max-w-full truncate text-text', tileChipSurface)}>
                {positionLabel}
              </DebateTileChip>
            )}
          </div>
          <div className="pointer-events-auto">{tileControls}</div>
          {/* No `min-w-0` here, unlike the label: it is what lets the column's `auto` minimum see
              the chip's real width. */}
          <div className="flex justify-end">{status}</div>
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
