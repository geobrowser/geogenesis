'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '~/core/debates/api';
import { ROOM_ENTER_CLASS, RoomExit } from '~/core/debates/debate-room-stamps';
import { openRoundWrapNote } from '~/core/debates/open-round-reveal';
import {
  BREAK_QUESTION_MS,
  BREAK_SETTLE_MS,
  BREAK_STAMP_GAP_MS,
  type BreakCue,
  type BreakCut,
  type EarlyEndCue,
  breakBannerAtMs,
} from '~/core/debates/playback-breaks';
import { type TurnCount, roundParts } from '~/core/debates/round-cues';

import { PlayerRoundTitle } from './debate-round-cues';
import {
  PLAYER_ENTER_CLASS,
  PLAYER_EXIT_CLASS,
  PLAYER_GLASS_CLASS,
  PLAYER_LABEL_FONT,
  PLAYER_PICK_CLASS,
  PLAYER_TITLE_CLASS,
  PLAYER_TITLE_STYLE,
} from './player-overlay-styles';
import { STAMP_WORD } from './stamp-styles';

/** The announcement fades before the cut to the next speaker. */
const BREAK_BANNER_OUT_MS = 300;

/**
 * How early a graphic is put on the page ahead of its start. The playhead arrives about four times
 * a second, so a graphic mounted only once a sample passed its start appeared up to a quarter of a
 * second late, with its roll-in already over. Mounted ahead, its held animation keeps it hidden
 * until `--break-t`, which runs every frame, reaches its start.
 */
const MOUNT_AHEAD_MS = 400;

/** Each debater's name, by slot. Slot 1 is the top tile. */
export type BreakNames = Record<ParticipantSlot, string>;

const SLOTS: ParticipantSlot[] = [1, 2];

/** Each slot's tile, as a box to centre a per-debater piece in. */
const TILE_CLASS: Record<ParticipantSlot, string> = {
  1: 'absolute inset-x-0 top-0 h-1/2',
  2: 'absolute inset-x-0 bottom-0 h-1/2',
};

/**
 * How far past the last playhead sample the animation may run on its own. The playhead arrives about
 * four times a second, from `timeupdate`; between samples the frame loop carries the time on, but
 * never further than this, so a stalled video does not leave its graphics running ahead of it.
 */
const MAX_AHEAD_MS = 500;

/** How long ahead of a cut its timer is set: the playhead arrives about four times a second. */
const CUT_LOOKAHEAD_MS = 1_000;
/** How far short of a cut the recording may be when its timer fires and still be cut: a frame or so. */
const CUT_TOLERANCE_MS = 50;
/** How often a cut the recording has not reached yet looks again. */
const CUT_RECHECK_MS = 50;

/**
 * Makes the player's cuts (`breakCuts`): at each one, jumps both recordings to where it leads. Timed
 * off the wall clock from the latest playhead sample, which lands it within a frame of the cut where
 * waiting for the next sample could miss it by a quarter of a second. Only while playing on its own:
 * a viewer who pauses or drags the scrubber into a break keeps it.
 *
 * The wall clock is not the recording's, though: a stall to buffer stops one and not the other. So
 * when the timer fires it asks where the recording really is (`positionMs`), and one that has not
 * reached the cut yet is waited for rather than jumped, which would skip the speaker's last words.
 * One already past where the cut leads is left alone rather than sent back there.
 */
export function useBreakCuts(
  cuts: readonly BreakCut[],
  {
    playheadMs,
    running,
    seek,
    positionMs,
  }: {
    playheadMs: number;
    running: boolean;
    seek: (seconds: number) => void;
    /** Where the recording is right now, in ms; null when it cannot be read. */
    positionMs?: () => number | null;
  }
) {
  const next = running
    ? (cuts.find(cut => playheadMs < cut.toMs && cut.atMs - playheadMs < CUT_LOOKAHEAD_MS) ?? null)
    : null;
  const atMs = next?.atMs ?? null;
  const toMs = next?.toMs ?? null;
  React.useEffect(() => {
    if (atMs === null || toMs === null) return;
    let timer = 0;
    const arm = (delayMs: number) => {
      timer = window.setTimeout(() => {
        const live = positionMs?.() ?? null;
        if (live !== null && live < atMs - CUT_TOLERANCE_MS) {
          arm(Math.max(CUT_RECHECK_MS, atMs - live));
          return;
        }
        // A timer that fired late (a throttled background tab) can find the recording already past
        // where the cut leads; seeking there now would rewind it.
        if (live !== null && live >= toMs) return;
        seek(toMs / 1_000);
      }, delayMs);
    };
    arm(Math.max(0, atMs - playheadMs));
    return () => window.clearTimeout(timer);
  }, [atMs, playheadMs, positionMs, seek, toMs]);
}

/** A gap between the drawn clock and the playhead wider than this is a jump (a scrub), not drift. */
export const BREAK_CLOCK_SNAP_MS = 400;

/** The share of the remaining drift taken in each frame: gone within a few frames, never a jump. */
const BREAK_CLOCK_EASE = 0.1;

/**
 * Where the break's drawn clock goes on the next frame, toward `targetMs`, the playhead read off its
 * last sample and carried on at real speed.
 *
 * The playhead arrives about four times a second and each sample can land a little behind or ahead
 * of where the frames had got to. Snapping to it made a 300 ms wipe step backwards and forwards: the
 * roll looked rough on some runs and smooth on others, depending on where the samples fell. So the
 * clock runs at real speed and takes the drift in a little at a time, and never moves backwards
 * while playing. Only a gap too wide to be drift, a scrub, is jumped.
 */
export function advanceBreakClock(displayedMs: number, targetMs: number, frameMs: number, playedMs: number) {
  const drift = targetMs - displayedMs;
  if (Math.abs(drift) > BREAK_CLOCK_SNAP_MS) return Math.min(playedMs, Math.max(0, targetMs));
  return Math.min(playedMs, displayedMs + Math.max(0, frameMs + drift * BREAK_CLOCK_EASE));
}

/**
 * Writes how far into the break the playhead is to `--break-t` on every frame, which is what the
 * held animations read (`heldAt`): smoothly while playing (`advanceBreakClock`), and exactly where
 * the playhead is while paused or on a break's first sample. That sample lands up to a quarter of a
 * second into the break, which is why nothing moves before `BREAK_SETTLE_MS`.
 */
function useBreakClock(ref: React.RefObject<HTMLDivElement | null>, cue: BreakCue | null, playing: boolean) {
  const sample = React.useRef({ elapsedMs: 0, at: 0 });
  const displayed = React.useRef<number | null>(null);
  const elapsedMs = cue?.elapsedMs ?? null;
  const playedMs = cue?.playedMs ?? 0;

  const write = React.useCallback(
    (ms: number) => {
      displayed.current = ms;
      ref.current?.style.setProperty('--break-t', String(ms));
    },
    [ref]
  );

  React.useLayoutEffect(() => {
    if (elapsedMs === null) {
      displayed.current = null;
      return;
    }
    sample.current = { elapsedMs, at: performance.now() };
    if (!playing || displayed.current === null) write(elapsedMs);
  }, [elapsedMs, playing, write]);

  const shown = elapsedMs !== null;
  React.useEffect(() => {
    if (!shown || !playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const { elapsedMs: sampled, at } = sample.current;
      const target = sampled + Math.min(now - at, MAX_AHEAD_MS);
      write(advanceBreakClock(displayed.current ?? target, target, now - last, playedMs));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playedMs, playing, shown, write]);
}

/**
 * Holds a CSS animation at the playhead: `--break-t`, ms into the break, less `startMs`, the moment
 * the animation begins. The keyframes run as written, and a viewer who scrubs or pauses mid-break
 * finds the motion exactly where the video is.
 */
function heldAt(startMs: number): React.CSSProperties {
  return { animationDelay: `calc(${startMs}ms - var(--break-t, 0) * 1ms)`, animationPlayState: 'paused' };
}

/** Shown, without a fade, from where a held animation starts: the mockup's dim and note appear at once. */
const APPEAR = 'animate-[fadeIn_1ms_linear_both]';

/** Open rounds breaks: outlined announcements with glass picks on each debater's video. */
export function DebateBreakOverlay({
  cue,
  names,
  firstSlot,
  roundTurns,
  playing,
}: {
  cue: BreakCue | null;
  names: BreakNames;
  firstSlot: ParticipantSlot;
  roundTurns: TurnCount;
  playing: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useBreakClock(ref, cue, playing);
  if (!cue) return null;

  const picks = cue.picks;
  const bannerAtMs = breakBannerAtMs(cue);
  const wrap = cue.kind === 'final_end';
  const note = wrap && picks ? openRoundWrapNote(picks[1], { name: names[2], pick: picks[2] }, names[1]) : null;
  const nextRound = roundParts((cue.nextRoundIndex ?? 0) * 2, roundTurns);
  const opener = wrap ? null : `${names[firstSlot]} opens`;

  return (
    <div ref={ref} aria-hidden data-debate-break={cue.kind} className="pointer-events-none absolute inset-0 z-[22]">
      {/* The dim comes in with the first graphic, not ahead of it: the question, or a lead-in's banner. */}
      <div data-debate-dim className={cx('absolute inset-0 bg-black/42', APPEAR)} style={heldAt(BREAK_SETTLE_MS)} />
      {picks && cue.elapsedMs < BREAK_SETTLE_MS + BREAK_QUESTION_MS && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div
            data-debate-question
            className={cx(PLAYER_TITLE_CLASS, PLAYER_ENTER_CLASS, 'text-[7cqw]')}
            style={{ ...PLAYER_TITLE_STYLE, ...heldAt(BREAK_SETTLE_MS) }}
          >
            Keep debating?
          </div>
        </div>
      )}

      {picks &&
        SLOTS.map((slot, order) => {
          const key = picks[slot] ?? 'none';
          return (
            <div key={slot} className={cx(TILE_CLASS[slot], 'grid place-items-center')}>
              <span
                data-debate-stamp={key}
                className={cx(
                  PLAYER_GLASS_CLASS,
                  PLAYER_PICK_CLASS[key],
                  PLAYER_ENTER_CLASS,
                  'px-[4cqw] py-[2cqw] text-[7cqw]'
                )}
                style={
                  {
                    ...PLAYER_LABEL_FONT,
                    ...heldAt(BREAK_SETTLE_MS + BREAK_QUESTION_MS + order * BREAK_STAMP_GAP_MS),
                  } as React.CSSProperties
                }
              >
                {STAMP_WORD[key]}
              </span>
            </div>
          );
        })}

      {cue.elapsedMs >= bannerAtMs - MOUNT_AHEAD_MS && (
        <div
          data-debate-banner-out
          // The wrap holds; a next-round announcement fades before the cut.
          className={cx('absolute inset-x-0 top-1/2 -translate-y-1/2', !wrap && PLAYER_EXIT_CLASS)}
          style={wrap ? undefined : heldAt(cue.playedMs - BREAK_BANNER_OUT_MS)}
        >
          <div
            data-debate-banner={wrap ? 'wrap' : 'round'}
            className={cx(PLAYER_ENTER_CLASS, 'px-[4cqw] text-center')}
            style={heldAt(bannerAtMs)}
          >
            {wrap ? (
              <div className={cx(PLAYER_TITLE_CLASS, 'text-[10cqw]')} style={PLAYER_TITLE_STYLE}>
                That’s a wrap
              </div>
            ) : (
              <PlayerRoundTitle {...nextRound} />
            )}
            {opener && (
              <span
                data-debate-banner-sub
                className={cx(PLAYER_TITLE_CLASS, 'mt-[2cqw] block truncate text-[4cqw]')}
                style={PLAYER_TITLE_STYLE}
              >
                {opener}
              </span>
            )}
          </div>
        </div>
      )}
      {note && cue.elapsedMs >= bannerAtMs - MOUNT_AHEAD_MS && (
        <div className={cx('absolute inset-x-0 top-[calc(50%+7.5cqw)] text-center', APPEAR)} style={heldAt(bannerAtMs)}>
          <span
            className={cx(PLAYER_GLASS_CLASS, 'inline-block max-w-[90%] text-[2.8cqw] whitespace-normal text-white')}
            style={PLAYER_LABEL_FONT}
          >
            {note}
          </span>
        </div>
      )}
    </div>
  );
}

/** Early ends use level glass pills and fade away with the dim. */
export function DebateEarlyEndLabels({ cue, names }: { cue: EarlyEndCue | null; names: BreakNames }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[22]">
      <RoomExit>
        {cue && (
          // The debater who ended is dimmed under their stamp, as in the mockup.
          <div data-debate-early-end className={cx(TILE_CLASS[cue.endedSlot], 'grid place-items-center')}>
            <div className={cx('absolute inset-0 bg-black/42', ROOM_ENTER_CLASS)} />
            <span
              data-debate-stamp="ended"
              className={cx(
                PLAYER_GLASS_CLASS,
                PLAYER_PICK_CLASS.none,
                PLAYER_ENTER_CLASS,
                'relative px-[4cqw] py-[2cqw] text-[6cqw]'
              )}
              style={PLAYER_LABEL_FONT}
            >
              Ended early
            </span>
          </div>
        )}
      </RoomExit>
      <RoomExit>
        {cue && (
          <div className={cx(TILE_CLASS[cue.nextSlot], 'grid place-items-center')}>
            <div
              data-debate-banner="turn"
              className={cx(
                PLAYER_GLASS_CLASS,
                PLAYER_ENTER_CLASS,
                'max-w-[90%] truncate px-[4cqw] py-[2cqw] text-[6cqw] text-white'
              )}
              style={PLAYER_LABEL_FONT}
            >
              {names[cue.nextSlot]}’s turn
            </div>
          </div>
        )}
      </RoomExit>
    </div>
  );
}
