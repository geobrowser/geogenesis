'use client';

import * as React from 'react';

import cx from 'classnames';

import { responsePositionLabel } from '~/core/responses/entity-response';

import { Text } from '~/design-system/text';

import { MutedMicrophoneIndicator } from './debate-room-controls';
import {
  ROOM_COUNT_ENTER_CLASS,
  ROOM_OUTLINED_STYLE,
  ROOM_UI_FONT,
  RoomDim,
  RoomExit,
  RoomMiddlePhrase,
  RoomPill,
  RoomTilePill,
} from './debate-room-stamps';
import { RecordingCornerIndicator } from './recording-corner-indicator';
import type { RecordingCountdownRingProps } from './recording-countdown-ring';
import { recordingLabelTextShadow, recordingOverlayTextShadow } from './recording-overlay-styles';

export { recordingLabelTextShadow, recordingOverlayTextShadow } from './recording-overlay-styles';

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
  openRounds = false,
  ...spanProps
}: React.ComponentPropsWithoutRef<'span'> & { openRounds?: boolean }) {
  return (
    <span
      {...spanProps}
      className={cx(
        'inline-flex items-center rounded-full leading-none whitespace-nowrap',
        openRounds ? 'h-[4.4cqw] gap-[1cqw] px-[1.8cqw] text-[2.8cqw] font-medium' : 'h-4 gap-1 px-1.5 text-[0.75rem]',
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Which side of the claim a debater is arguing, as it reads over their video: the tile chip in the
 * shared fill, carrying "Agree" or "Disagree". Every claim asks the same question, so those are the
 * only two words it renders — pass a label from {@link responsePositionLabel} rather than geo-chat's
 * `position_label`, which still says "Verify" on a claim it calls factual.
 *
 * One component rather than the recipe twice, because the room and the feed player state the same
 * fact about the same person in the same corner of the same picture; the only difference is where
 * they read it from. It also keeps the fill with the contrast note that justifies it — a caller
 * reaching for `DebateTileChip` and picking its own background is exactly what {@link
 * tileChipSurface} is written to prevent.
 *
 * `shrink-0`, so the position is never the thing that truncates: these labels are short and
 * bounded, and half of "Disagree" is worse than a shortened name beside it. `max-w-full` is what
 * caps it in a column narrower than the word — it truncates there rather than overflowing.
 */
export function DebatePositionChip({
  label,
  className,
  ...spanProps
}: React.ComponentPropsWithoutRef<'span'> & { label: string; openRounds?: boolean }) {
  return (
    <DebateTileChip {...spanProps} className={cx('max-w-full shrink-0 truncate text-text', tileChipSurface, className)}>
      {label}
    </DebateTileChip>
  );
}

/**
 * One participant's tile, shared by the intro screen and the recording modal so the two have the
 * same geometry. Everything past the video is optional: the intro passes a label and an overlay,
 * the debate adds turn countdowns and phase overlays.
 *
 * **The side is named here, not passed.** Every caller had a `position_label` from geo-chat to
 * hand down beside the position itself — and that label reads "Verify" or "Dispute" on a claim
 * geo-chat still calls factual, which is a word this app no longer has a way to publish. The side
 * is the same boolean either way, so the name is ours to say.
 */
export function DebateVideoTile({
  participantPosition,
  active,
  overlayText,
  overlayCompact = false,
  upcomingSeconds,
  upcomingLabel = "You're up in",
  showGo = false,
  showWrapItUp = false,
  showDebateEndsSoon = false,
  endingTurn = false,
  turnEndedStamp = true,
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
  reveal,
  chipsHidden = false,
  openRounds = false,
  dimmed = false,
  finalSeconds = false,
  nextTurnName = null,
  children,
}: {
  participantPosition: boolean | null;
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
  /**
   * Open rounds only: whether an ended turn is labelled "Turn ended". Only a turn that hands over to the
   * other speaker is; any other yield closes as soon as it is accepted, so its tile just dims.
   */
  turnEndedStamp?: boolean;
  endTurnAction?: React.ReactNode;
  inactive?: boolean;
  revealInactive?: boolean;
  inactiveIndicatorId: 'local' | 'remote';
  /** Names the tile for assistive technology — otherwise both are unlabelled `section`s. */
  tileLabel?: string;
  showMutedIndicator?: boolean;
  countdown?: React.ReactElement<RecordingCountdownRingProps> | null;
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
  /** Over the middle of the tile, above the phase overlays: the Open rounds pick reveal (GEO-3179). */
  reveal?: React.ReactNode;
  /**
   * Fades the bottom row out while result text sits over the gap between the tiles, which is where
   * the upper tile's chips are (GEO-3179).
   */
  chipsHidden?: boolean;
  /**
   * Open rounds (GEO-3366): classic outlined type and glass pills. Fixed formats keep their overlays.
   */
  openRounds?: boolean;
  /** Open rounds only: dims the picture under a moment that spans both tiles, like the pick and the reveal. */
  dimmed?: boolean;
  /** Open rounds only: the speaker's last five seconds, when their outline turns warning red with the timer. */
  finalSeconds?: boolean;
  /** Open rounds only: after you end your turn, whose turn it is now, on their tile. */
  nextTurnName?: string | null;
  children: React.ReactNode;
}) {
  const positionLabel = participantPosition === null ? null : responsePositionLabel(participantPosition);
  const showInactiveIndicator =
    showMutedIndicator || (inactive && !revealInactive && !countdown && !overlayText && !endingTurn);
  const upcoming = upcomingSeconds !== null && upcomingSeconds !== undefined;

  return (
    <section
      aria-label={tileLabel}
      data-debate-video-position={participantPosition === null ? undefined : participantPosition ? 'yes' : 'no'}
      data-active-speaker={active ? 'true' : 'false'}
      data-final-seconds={openRounds && finalSeconds ? 'true' : undefined}
      style={openRounds ? ROOM_UI_FONT : undefined}
      className={cx(
        'relative min-h-0 overflow-hidden bg-black shadow-card',
        openRounds ? '@container aspect-[8/5] rounded-[3cqw] text-white' : 'aspect-[5/3] rounded-lg',
        active && ['outline-[3px]', openRounds ? '-outline-offset-3' : 'outline-offset-0'],
        active && (openRounds ? (finalSeconds ? 'outline-[#FF4A26]' : 'outline-white') : 'outline-purple')
      )}
    >
      <div className="absolute inset-0 z-0">{children}</div>
      {openRounds && active && (
        // A negative outline alone paints below positioned video content. Draw its inside edge
        // above the media so the white/red speaker border remains visible on a live camera too.
        <div
          aria-hidden="true"
          data-room-speaker-outline
          className={cx(
            'pointer-events-none absolute inset-0 z-50 rounded-[inherit] border-[3px]',
            finalSeconds ? 'border-[#FF4A26]' : 'border-white'
          )}
        />
      )}
      {openRounds && <RoomDim on={dimmed || endingTurn || upcoming} />}
      {/* Ending a turn hands the corner from the timer to the muted microphone and takes End turn
          away, so in Open rounds each fades rather than cutting (GEO-3347). Fixed formats cut. */}
      {(openRounds || endTurnAction) && (
        <div className={cx('absolute z-40', openRounds ? 'top-[2.4cqw] left-[2.4cqw]' : 'top-3 left-3')}>
          {openRounds ? (
            <RoomExit layout="inline">
              {endTurnAction && <div className="pointer-events-auto">{endTurnAction}</div>}
            </RoomExit>
          ) : (
            endTurnAction
          )}
        </div>
      )}
      {openRounds ? (
        <RecordingCornerIndicator
          participant={inactiveIndicatorId}
          muted={showInactiveIndicator}
          // The count-in's number is the countdown, so the timer steps aside for it.
          countdown={upcoming ? null : countdown}
        />
      ) : (
        <>
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
        </>
      )}

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
      {(positionLabel !== null || tileControls || status) && (
        <div
          data-tile-chips={chipsHidden ? 'hidden' : 'visible'}
          className={cx(
            'pointer-events-none absolute z-30 grid grid-cols-[minmax(0,1fr)_auto_minmax(auto,1fr)] items-center transition-opacity duration-200 motion-reduce:transition-none',
            openRounds ? 'inset-x-[2.4cqw] bottom-[2.4cqw] gap-[1cqw]' : 'inset-x-3 bottom-3 gap-2',
            chipsHidden && 'opacity-0'
          )}
        >
          <div className="flex min-w-0 justify-start">
            {positionLabel !== null && <DebatePositionChip label={positionLabel} openRounds={openRounds} />}
          </div>
          <div className="pointer-events-auto">{tileControls}</div>
          {/* No `min-w-0` here, unlike the label: it is what lets the column's `auto` minimum see
              the chip's real width. */}
          <div className="flex justify-end">{status}</div>
        </div>
      )}

      {openRounds ? (
        <>
          <RoomExit className="z-30">
            {closingMessage && (
              <RoomMiddlePhrase sizeCqw={5.46} data-room-phrase="thanks">
                Nice debate! Say thanks
              </RoomMiddlePhrase>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {endingTurn && turnEndedStamp && (
              <RoomTilePill data-room-pill="ended" tone="dashed">
                Turn ended
              </RoomTilePill>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {nextTurnName && (
              <RoomTilePill delayMs={600} data-room-pill="turn">
                {nextTurnName}’s turn
              </RoomTilePill>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {upcoming && (
              <div
                data-room-count-in-group
                className="absolute top-1/2 left-1/2 grid w-max max-w-[92%] -translate-x-1/2 -translate-y-1/2 justify-items-center text-center"
              >
                <span
                  className="text-[7.02cqw] leading-none font-semibold tracking-normal whitespace-nowrap text-white/85"
                  data-room-phrase="count-in"
                  style={ROOM_OUTLINED_STYLE}
                >
                  {upcomingLabel.replace("You're", 'You’re')}
                </span>
                <span
                  key={upcomingSeconds}
                  className={cx(
                    'text-[15.6cqw] leading-[0.9] font-bold tracking-[-0.02em] whitespace-nowrap text-white',
                    ROOM_COUNT_ENTER_CLASS
                  )}
                  data-room-count-in
                  style={ROOM_OUTLINED_STYLE}
                >
                  {upcomingSeconds}
                </span>
              </div>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {showGo && (
              <RoomTilePill data-room-pill="go" tone="white" fadeInMs={200}>
                Go
              </RoomTilePill>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {showWrapItUp && (
              <RoomTilePill data-room-pill="wrap-it-up" tone="red">
                Wrap it up
              </RoomTilePill>
            )}
          </RoomExit>

          <RoomExit className="z-30">
            {showDebateEndsSoon && (
              <RoomMiddlePhrase sizeCqw={6.24} data-room-phrase="ends-soon">
                Debate ends soon
              </RoomMiddlePhrase>
            )}
          </RoomExit>

          <RoomExit className="z-[35]">{reveal}</RoomExit>
        </>
      ) : (
        <>
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
              <div
                className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white"
                style={recordingOverlayTextShadow}
              >
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
        </>
      )}

      {!openRounds && reveal}

      {openRounds ? (
        <RoomExit className="z-10">
          {overlayText && (
            <div
              role="status"
              aria-live="polite"
              data-room-media-status
              className="pointer-events-none absolute inset-0 grid place-items-center bg-black/42 px-[4cqw] backdrop-blur-sm"
            >
              <RoomPill className={overlayCompact ? '[&>span]:text-balance [&>span]:whitespace-normal' : undefined}>
                {overlayText}
              </RoomPill>
            </div>
          )}
        </RoomExit>
      ) : overlayText ? (
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
      ) : null}
    </section>
  );
}
