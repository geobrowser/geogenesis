'use client';

import * as React from 'react';

import cx from 'classnames';

import type { OpenRoundPick, ParticipantSlot } from '~/core/debates/api';
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
import { type TurnCount, roundLabel } from '~/core/debates/round-cues';

import { BANNER_CLASS, LABEL_FONT, STAMP_CLASS, STAMP_FONT } from './stamp-styles';

/** How long the banner takes to roll out, ending as the player cuts. Matches `--animate-debate-banner-out`. */
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

const STAMP_WORD: Record<OpenRoundPick | 'none', string> = { extend: 'Extend', end: 'End', none: 'No pick' };
const STAMP_INK: Record<OpenRoundPick | 'none', string> = {
  extend: 'text-purple',
  end: 'text-text',
  none: 'border-dashed text-grey-04',
};
/** Each tile's stamp leans its own way, so the two read as two hands. The design mockup's tilts. */
const STAMP_TILT: Record<ParticipantSlot, string> = { 1: '-3.2deg', 2: '2.4deg' };
/** "Ended early" leans the other way from a pick. */
const ENDED_TILT = '2deg';

/** Shown, without a fade, from where a held animation starts: the mockup's dim and note appear at once. */
const APPEAR = 'motion-safe:animate-[fadeIn_1ms_linear_both]';

/**
 * The break between two Open rounds in a published debate (GEO-3277): the approved "stamps".
 *
 * - The question the room asked, "Keep debating?", in plain white type.
 * - Each pick stamped onto its debater, one after the other: Extend in the room's purple, End in
 *   black, a missing pick as "No pick", grey and dashed.
 * - A banner across the seam with what the picks mean: the next round in the round badge's words
 *   ("Round 2 · Rebuttal") with who opens it on a smaller line beneath, or "That's a wrap", with the
 *   missing-pick line where that is why. The name sits on its own line so the banner keeps one size
 *   whatever the name: a long one truncates there instead of shrinking the round. Every banner is
 *   purple, the wrap included.
 *
 * In Geist, square-cornered, with a light tilt and no bounce: the agreed design keeps the game feel
 * without reading as cartoony.
 *
 * Before a required round nobody picked, so it is the banner alone. The tiles dim underneath, since
 * the footage there is people looking at their screens.
 *
 * `aria-hidden`, like the round card: the round badge and the scrubber carry where the debate is.
 */
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
  const title = wrap ? 'That’s a wrap' : roundLabel((cue.nextRoundIndex ?? 0) * 2, roundTurns);
  const opener = wrap ? null : `${names[firstSlot]} opens`;

  return (
    <div ref={ref} aria-hidden data-debate-break={cue.kind} className="pointer-events-none absolute inset-0 z-[22]">
      {/* The dim comes in with the first graphic, not ahead of it: the question, or a lead-in's banner. */}
      <div data-debate-dim className={cx('absolute inset-0 bg-black/42', APPEAR)} style={heldAt(BREAK_SETTLE_MS)} />
      {picks && cue.elapsedMs < BREAK_SETTLE_MS + BREAK_QUESTION_MS && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div
            data-debate-question
            // Down from twice its size, a touch past, and settled: the mockup's slam. Hidden until then.
            className="text-[7cqw] leading-[1.1] font-medium tracking-[-0.01em] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.55),0_0_24px_rgba(0,0,0,0.45)] motion-safe:animate-debate-slam"
            style={{ ...LABEL_FONT, ...heldAt(BREAK_SETTLE_MS) }}
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
                className={cx(STAMP_CLASS, 'text-[12cqw] motion-safe:animate-debate-stamp', STAMP_INK[key])}
                style={
                  {
                    ...STAMP_FONT,
                    transform: `rotate(${STAMP_TILT[slot]})`,
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
          // Rolls on out, the way it rolled in, as the cut to the next speaker comes. The wrap stays:
          // the debate ends under it.
          className={cx(
            'absolute inset-x-0 top-1/2 -translate-y-1/2',
            !wrap && 'motion-safe:animate-debate-banner-out'
          )}
          style={wrap ? undefined : heldAt(cue.playedMs - BREAK_BANNER_OUT_MS)}
        >
          <div
            data-debate-banner={wrap ? 'wrap' : 'round'}
            className={cx(BANNER_CLASS, 'text-[5cqw] motion-safe:animate-debate-banner')}
            style={{ ...LABEL_FONT, ...heldAt(bannerAtMs) }}
          >
            <span className="block truncate">{title}</span>
            {opener && (
              <span
                data-debate-banner-sub
                className="mt-[0.35em] block truncate text-[0.6em] tracking-[0.02em] normal-case opacity-85"
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
            className="inline-block rounded-[3px] bg-black/72 px-[2.2cqw] py-[1.3cqw] text-[2.8cqw] leading-[1.2] font-medium tracking-[0.01em] text-white"
            style={LABEL_FONT}
          >
            {note}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Around an early end in an Open rounds debate: an "Ended early" stamp on the debater who ended
 * their turn, and a purple banner with whose turn it is on the other tile, in the breaks' design.
 * The playback counterpart of the room's "Ending turn…" and count-in.
 */
export function DebateEarlyEndLabels({ cue, names }: { cue: EarlyEndCue | null; names: BreakNames }) {
  if (!cue) return null;

  return (
    <div aria-hidden data-debate-early-end className="pointer-events-none absolute inset-0 z-[22]">
      {/* The debater who ended is dimmed under their stamp, as in the mockup. */}
      <div className={cx(TILE_CLASS[cue.endedSlot], 'grid place-items-center bg-black/42')}>
        <span
          data-debate-stamp="ended"
          className={cx(STAMP_CLASS, 'border-dashed text-[9cqw] text-grey-04 motion-safe:animate-debate-stamp')}
          style={{ ...STAMP_FONT, transform: `rotate(${ENDED_TILT})` }}
        >
          Ended early
        </span>
      </div>
      <div className={cx(TILE_CLASS[cue.nextSlot], 'grid place-items-center')}>
        <div
          data-debate-banner="turn"
          className={cx(BANNER_CLASS, 'truncate text-[6cqw] motion-safe:animate-debate-banner')}
          style={LABEL_FONT}
        >
          {names[cue.nextSlot]}’s turn
        </div>
      </div>
    </div>
  );
}
