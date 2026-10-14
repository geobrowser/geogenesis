'use client';

import * as React from 'react';

import cx from 'classnames';

import type { OpenRoundPick, ParticipantSlot } from '~/core/debates/api';
import { recordingLabelTextShadow } from '~/core/debates/debate-video-tile';
import { openRoundWrapNote } from '~/core/debates/open-round-reveal';
import {
  BREAK_BANNER_AT_MS,
  BREAK_QUESTION_MS,
  BREAK_SETTLE_MS,
  BREAK_STAMP_GAP_MS,
  type BreakCue,
  type BreakCut,
  type EarlyEndCue,
} from '~/core/debates/playback-breaks';
import { type TurnCount, roundLabel } from '~/core/debates/round-cues';

/** How long the banner takes to roll out, ending as the player cuts. Matches `--animate-debate-banner-out`. */
const BREAK_BANNER_OUT_MS = 300;

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

/**
 * Makes the player's cuts (`breakCuts`): at each one, jumps both recordings to where it leads. Timed
 * off the wall clock from the latest playhead sample, which lands it within a frame of the cut where
 * waiting for the next sample could miss it by a quarter of a second. Only while playing on its own:
 * a viewer who pauses or drags the scrubber into a break keeps it.
 */
export function useBreakCuts(
  cuts: readonly BreakCut[],
  { playheadMs, running, seek }: { playheadMs: number; running: boolean; seek: (seconds: number) => void }
) {
  const next = running
    ? (cuts.find(cut => playheadMs < cut.toMs && cut.atMs - playheadMs < CUT_LOOKAHEAD_MS) ?? null)
    : null;
  const atMs = next?.atMs ?? null;
  const toMs = next?.toMs ?? null;
  React.useEffect(() => {
    if (atMs === null || toMs === null) return;
    const timer = window.setTimeout(() => seek(toMs / 1_000), Math.max(0, atMs - playheadMs));
    return () => window.clearTimeout(timer);
  }, [atMs, playheadMs, seek, toMs]);
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
/** Each tile's stamp leans its own way, so the two read as two hands. */
const STAMP_TILT: Record<ParticipantSlot, string> = { 1: '-8deg', 2: '6deg' };

/**
 * The break between two Open rounds in a published debate (GEO-3277): the approved "stamps".
 *
 * - The question the room asked, "Keep debating?", in the outlined type the video's labels wear.
 * - Each pick stamped onto its debater, one after the other: Extend in the room's purple, End in
 *   black, a missing pick as "No pick", grey and dashed.
 * - A banner across the seam with what the picks mean: the next round in the round badge's words
 *   ("Round 2 · Rebuttal") with who opens it on a smaller line beneath, or "That's a wrap", with the
 *   missing-pick line where that is why. The name sits on its own line so the banner keeps one size
 *   whatever the name: a long one truncates there instead of shrinking the round.
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
  const bannerAtMs = picks ? BREAK_BANNER_AT_MS : BREAK_SETTLE_MS;
  const wrap = cue.kind === 'final_end';
  const note = wrap && picks ? openRoundWrapNote(picks[1], { name: names[2], pick: picks[2] }, names[1]) : null;
  const title = wrap ? 'That’s a wrap' : roundLabel((cue.nextRoundIndex ?? 0) * 2, roundTurns);
  const opener = wrap ? null : `${names[firstSlot]} opens`;

  return (
    <div
      ref={ref}
      aria-hidden
      data-debate-break={cue.kind}
      className="pointer-events-none absolute inset-0 z-[22] bg-black/40"
    >
      {picks && cue.elapsedMs < BREAK_SETTLE_MS + BREAK_QUESTION_MS && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div
            data-debate-question
            className="text-recordingLabel text-text motion-safe:animate-open-round-slam"
            style={{ ...recordingLabelTextShadow, ...heldAt(BREAK_SETTLE_MS) }}
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
                  'rounded-[10px] border-[5px] border-current bg-white px-4 pt-1.5 pb-1 text-[11cqw] leading-none font-bold tracking-[0.06em] whitespace-nowrap uppercase shadow-[0_10px_30px_rgba(0,0,0,0.35)] motion-safe:animate-debate-stamp',
                  STAMP_INK[key]
                )}
                style={
                  {
                    '--stamp-rotate': STAMP_TILT[slot],
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

      {cue.elapsedMs >= bannerAtMs && (
        <div
          data-debate-banner-out
          // Rolls on out, the way it rolled in, as the cut to the next speaker comes.
          className="absolute inset-x-0 top-1/2 grid -translate-y-1/2 justify-items-center gap-2.5 motion-safe:animate-debate-banner-out"
          style={heldAt(cue.playedMs - BREAK_BANNER_OUT_MS)}
        >
          <div
            data-debate-banner={wrap ? 'wrap' : 'round'}
            className={cx(
              'w-full px-4 py-3 text-center text-[7cqw] leading-none font-bold tracking-[0.05em] whitespace-nowrap text-white uppercase shadow-[0_6px_24px_rgba(0,0,0,0.4)] motion-safe:animate-debate-banner',
              wrap ? 'bg-text' : 'bg-purple'
            )}
            style={heldAt(bannerAtMs)}
          >
            <span className="block truncate">{title}</span>
            {opener && (
              <span
                data-debate-banner-sub
                className="mt-[0.35em] block truncate text-[0.55em] font-medium tracking-[0.02em] normal-case opacity-85"
              >
                {opener}
              </span>
            )}
          </div>
          {note && (
            <span className="rounded-xl border border-white/40 bg-black/70 px-3 py-1.5 text-metadata text-white">
              {note}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Around an early end: "Ended early" on the debater who ended their turn, and whose turn it is on
 * the other tile. The playback counterpart of the room's "Ending turn…" and count-in, in the same
 * type.
 */
export function DebateEarlyEndLabels({ cue, names }: { cue: EarlyEndCue | null; names: BreakNames }) {
  if (!cue) return null;
  const label = (slot: ParticipantSlot) =>
    slot === cue.endedSlot ? 'Ended early' : slot === cue.nextSlot ? `${names[slot]}’s turn` : null;

  return (
    <div aria-hidden data-debate-early-end className="pointer-events-none absolute inset-0 z-[22]">
      {SLOTS.map(slot => {
        const text = label(slot);
        if (!text) return null;
        return (
          <div
            key={slot}
            className={`${TILE_CLASS[slot]} grid place-items-center px-4 text-center text-recordingLabel text-text`}
            style={recordingLabelTextShadow}
          >
            {text}
          </div>
        );
      })}
    </div>
  );
}
