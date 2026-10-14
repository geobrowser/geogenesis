'use client';

import * as React from 'react';

import cx from 'classnames';

import type { OpenRoundPick, ParticipantSlot } from '~/core/debates/api';
import { recordingLabelTextShadow } from '~/core/debates/debate-video-tile';
import { openRoundWrapNote } from '~/core/debates/open-round-reveal';
import { openRoundNumber } from '~/core/debates/open-rounds';
import {
  BREAK_BANNER_AT_MS,
  BREAK_QUESTION_MS,
  BREAK_STAMP_GAP_MS,
  type BreakCue,
  type BreakCut,
  type EarlyEndCue,
} from '~/core/debates/playback-breaks';

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

/**
 * Writes how far into the break the playhead is to `--break-t` on every frame, which is what the
 * held animations read (`heldAt`). Smoothed between the player's playhead samples while playing,
 * and held still while paused.
 */
function useBreakClock(ref: React.RefObject<HTMLDivElement | null>, cue: BreakCue | null, playing: boolean) {
  const sample = React.useRef({ elapsedMs: 0, at: 0 });
  const elapsedMs = cue?.elapsedMs ?? null;
  const playedMs = cue?.playedMs ?? 0;

  React.useLayoutEffect(() => {
    if (elapsedMs === null) return;
    sample.current = { elapsedMs, at: performance.now() };
    ref.current?.style.setProperty('--break-t', String(elapsedMs));
  }, [elapsedMs, ref]);

  const shown = elapsedMs !== null;
  React.useEffect(() => {
    if (!shown || !playing) return;
    let frame = 0;
    const tick = () => {
      const { elapsedMs: sampled, at } = sample.current;
      const ahead = Math.min(performance.now() - at, MAX_AHEAD_MS);
      ref.current?.style.setProperty('--break-t', String(Math.min(playedMs, sampled + ahead)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playedMs, playing, ref, shown]);
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
 * - A banner across the seam with what the picks mean: the next round and who opens it, or "That's
 *   a wrap", with the missing-pick line where that is why.
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
  playing,
}: {
  cue: BreakCue | null;
  names: BreakNames;
  firstSlot: ParticipantSlot;
  playing: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useBreakClock(ref, cue, playing);
  if (!cue) return null;

  const picks = cue.picks;
  const bannerAtMs = picks ? BREAK_BANNER_AT_MS : 0;
  const wrap = cue.kind === 'final_end';
  const note = wrap && picks ? openRoundWrapNote(picks[1], { name: names[2], pick: picks[2] }, names[1]) : null;

  return (
    <div
      ref={ref}
      aria-hidden
      data-debate-break={cue.kind}
      className="pointer-events-none absolute inset-0 z-[22] bg-black/40"
      style={{ '--break-t': String(cue.elapsedMs) } as React.CSSProperties}
    >
      {picks && cue.elapsedMs < BREAK_QUESTION_MS && (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div
            data-debate-question
            className="text-recordingLabel text-text motion-safe:animate-open-round-slam"
            style={{ ...recordingLabelTextShadow, ...heldAt(0) }}
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
                  'rounded-[10px] border-[5px] border-current bg-white/92 px-4 pt-1.5 pb-1 text-[11cqw] leading-none font-bold tracking-[0.06em] whitespace-nowrap uppercase shadow-[0_10px_30px_rgba(0,0,0,0.35)] motion-safe:animate-debate-stamp',
                  STAMP_INK[key]
                )}
                style={
                  {
                    '--stamp-rotate': STAMP_TILT[slot],
                    transform: `rotate(${STAMP_TILT[slot]})`,
                    ...heldAt(BREAK_QUESTION_MS + order * BREAK_STAMP_GAP_MS),
                  } as React.CSSProperties
                }
              >
                {STAMP_WORD[key]}
              </span>
            </div>
          );
        })}

      {cue.elapsedMs >= bannerAtMs && (
        <div className="absolute inset-x-0 top-1/2 grid -translate-y-1/2 justify-items-center gap-2.5">
          <div
            data-debate-banner={wrap ? 'wrap' : 'round'}
            className={cx(
              'grid w-full place-items-center px-4 py-3 text-[7cqw] leading-none font-bold tracking-[0.05em] text-white uppercase shadow-[0_6px_24px_rgba(0,0,0,0.4)] motion-safe:animate-debate-banner',
              wrap ? 'bg-text' : 'bg-purple'
            )}
            style={heldAt(bannerAtMs)}
          >
            {wrap ? 'That’s a wrap' : `Round ${openRoundNumber(cue.nextRoundIndex ?? 0)} · ${names[firstSlot]} opens`}
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
