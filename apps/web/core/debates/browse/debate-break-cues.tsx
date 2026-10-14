'use client';

import * as React from 'react';

import type { ParticipantSlot } from '~/core/debates/api';
import { recordingLabelTextShadow } from '~/core/debates/debate-video-tile';
import {
  OpenRoundPickReveal,
  type OpenRoundResult,
  OpenRoundResultOverlay,
  openRoundWrapNote,
} from '~/core/debates/open-round-reveal';
import { openRoundNumber } from '~/core/debates/open-rounds';
import type { BreakCue, EarlyEndCue } from '~/core/debates/playback-breaks';

/** Each debater's name, by slot. Slot 1 is the top tile. */
export type BreakNames = Record<ParticipantSlot, string>;

const SLOTS: ParticipantSlot[] = [1, 2];

/** Each slot's tile, as a box the room's per-tile pieces can position themselves in. */
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

/**
 * Writes how far into the break the playhead is to `--open-round-t` on every frame, which is what
 * the reveal's held animations read (`heldAt` in `open-round-reveal.tsx`). Smoothed between the
 * player's playhead samples while playing, and held still while paused.
 */
function useBreakClock(ref: React.RefObject<HTMLDivElement | null>, cue: BreakCue | null, playing: boolean) {
  const sample = React.useRef({ elapsedMs: 0, at: 0 });
  const elapsedMs = cue?.elapsedMs ?? null;
  const durationMs = cue?.durationMs ?? 0;

  React.useLayoutEffect(() => {
    if (elapsedMs === null) return;
    sample.current = { elapsedMs, at: performance.now() };
    ref.current?.style.setProperty('--open-round-t', String(elapsedMs));
  }, [elapsedMs, ref]);

  const shown = elapsedMs !== null;
  React.useEffect(() => {
    if (!shown || !playing) return;
    let frame = 0;
    const tick = () => {
      const { elapsedMs: sampled, at } = sample.current;
      const ahead = Math.min(performance.now() - at, MAX_AHEAD_MS);
      ref.current?.style.setProperty('--open-round-t', String(Math.min(durationMs, sampled + ahead)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, playing, ref, shown]);
}

/**
 * What a break between Open rounds means, drawn over the condensed catch-up a published video plays
 * there (GEO-3277): the room's own reveal, at the pace of the break rather than the room's.
 *
 * - After an Extend: the picks turn over, then "Round N" and who opens it.
 * - Before a required round: "Round N" and who opens it. Nobody picked, so there are no cards.
 * - After the final End: the picks turn over and stay up beside "That's a wrap", so a split, or a
 *   missing pick, explains itself, as in the room.
 *
 * `aria-hidden`, like the round card: the scrubber and the round badge carry the round, and the
 * picks are what the round's outcome already says.
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

  const inResult = cue.elapsedMs >= cue.resultStartMs;
  const result: OpenRoundResult | null = !inResult
    ? null
    : cue.kind === 'final_end'
      ? { kind: 'wrap', note: openRoundWrapNote(cue.picks?.[1], { name: names[2], pick: cue.picks?.[2] }, names[1]) }
      : { kind: 'round', round: openRoundNumber(cue.nextRoundIndex ?? 0), opener: names[firstSlot] };
  // A new round takes the tiles back for its own text; an End leaves the picks up beside the wrap.
  const picks = cue.picks && (!inResult || cue.kind === 'final_end') ? cue.picks : null;

  return (
    <div
      ref={ref}
      aria-hidden
      data-debate-break={cue.kind}
      className="pointer-events-none absolute inset-0 z-[22]"
      style={{ '--open-round-t': String(cue.elapsedMs) } as React.CSSProperties}
    >
      {picks &&
        SLOTS.map(slot => (
          <div key={slot} className={TILE_CLASS[slot]}>
            <OpenRoundPickReveal
              name={names[slot]}
              pick={picks[slot]}
              placement={inResult ? (slot === 1 ? 'raised' : 'lowered') : 'center'}
              heldAtMs={0}
            />
          </div>
        ))}
      {result && <OpenRoundResultOverlay result={result} heldAtMs={cue.resultStartMs} />}
    </div>
  );
}

/**
 * Around an early end the render cut down to a short quiet: "Ended early" on the debater who ended
 * their turn, and whose turn it is on the other tile. The playback counterpart of the room's
 * "Ending turn…" and count-in, in the same type.
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
