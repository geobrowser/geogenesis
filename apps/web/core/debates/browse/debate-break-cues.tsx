'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '~/core/debates/api';
import { DebateRoomOverlayCard } from '~/core/debates/debate-room-overlay-card';
import { recordingLabelTextShadow } from '~/core/debates/debate-video-tile';
import {
  OpenRoundPickReveal,
  type OpenRoundResult,
  OpenRoundResultOverlay,
  openRoundWrapNote,
} from '~/core/debates/open-round-reveal';
import { openRoundNumber } from '~/core/debates/open-rounds';
import type { BreakCue, BreakCut, EarlyEndCue } from '~/core/debates/playback-breaks';

import { Check } from '~/design-system/icons/check';
import { Text } from '~/design-system/text';

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

type RevealCue = Extract<BreakCue, { phase: 'reveal' }>;

/** How far ahead of a cut its timer is set: the playhead arrives about four times a second. */
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
 * Writes how far into the reveal the playhead is to `--open-round-t` on every frame, which is what
 * the reveal's held animations read (`heldAt` in `open-round-reveal.tsx`). Smoothed between the
 * player's playhead samples while playing, and held still while paused.
 */
function useRevealClock(ref: React.RefObject<HTMLDivElement | null>, cue: RevealCue | null, playing: boolean) {
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
 * What a break between Open rounds means, drawn over it in a published debate (GEO-3277): the
 * moment the room put to both debaters, then the room's own reveal.
 *
 * - While they pick: "Keep debating?", the question they were asked, with a tick as each one picks.
 *   Never which way: the picks stay blind until the reveal, as they were for the debaters.
 * - After an Extend: the picks turn over, then "Round N" and who opens it.
 * - Before a required round: "Round N" and who opens it. Nobody picked, so there are no cards.
 * - After the final End: the picks turn over and stay up beside "That's a wrap", so a split, or a
 *   missing pick, explains itself, as in the room.
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
  const reveal = cue?.phase === 'reveal' ? cue : null;
  useRevealClock(ref, reveal, playing);
  if (!cue) return null;
  if (cue.phase === 'deciding') return <DebateDecidingCard cue={cue} names={names} />;

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
 * The question the room asked both debaters, for a viewer who did not see it asked: the room's
 * pick card surface and words, with each debater's state where the room had buttons.
 */
function DebateDecidingCard({ cue, names }: { cue: Extract<BreakCue, { phase: 'deciding' }>; names: BreakNames }) {
  const next = cue.nextRoundIndex ?? cue.roundIndex + 1;
  return (
    // The card's own layer sits above the player's controls in the room; here it stays under them.
    <div aria-hidden data-debate-deciding={cue.roundIndex} className="pointer-events-none absolute inset-0 z-[22]">
      <DebateRoomOverlayCard className="w-[calc(100%-1.5rem)] max-w-[318px] gap-2.5 p-3">
        <div className="min-w-0">
          <p className="text-smallTitle text-text">Keep debating?</p>
          <Text as="p" variant="footnote" color="grey-04" className="mt-1">
            Each picks Extend or End in secret. An Extend unlocks Round {openRoundNumber(next)} unless either picks End.
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SLOTS.map(slot => (
            <div
              key={slot}
              data-debate-deciding-slot={slot}
              data-picked={cue.picked[slot] ? 'true' : 'false'}
              className={cx(
                'flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-metadataMedium',
                cue.picked[slot] ? 'bg-grey-01 text-text' : 'border border-dashed border-grey-03 text-grey-04'
              )}
            >
              {cue.picked[slot] && <Check />}
              <span className="min-w-0 truncate">{names[slot]}</span>
              <span className="ml-auto shrink-0 font-normal">{cue.picked[slot] ? 'Picked' : 'Deciding…'}</span>
            </div>
          ))}
        </div>
      </DebateRoomOverlayCard>
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
