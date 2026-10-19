'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '~/core/debates/api';
import { RoomExit } from '~/core/debates/debate-room-stamps';
import { BREAK_SETTLE_MS, type BreakCue, type BreakCut, type EarlyEndCue } from '~/core/debates/playback-breaks';
import { type TurnCount, roundParts } from '~/core/debates/round-cues';

import { PlayerRoundTitle } from './debate-round-cues';
import {
  PLAYER_ENTER_CLASS,
  PLAYER_EXIT_CLASS,
  PLAYER_EXIT_MS,
  PLAYER_FADE_CLASS,
  PLAYER_PICK_BASE_CLASS,
  PLAYER_PICK_CLASS,
  PLAYER_PICK_STYLE,
  PLAYER_TITLE_CLASS,
  PLAYER_TITLE_STYLE,
} from './player-overlay-styles';
import { heldAt, usePlaybackAnimationClock } from './use-playback-animation-clock';

/** Each debater's name, by slot. Slot 1 is the top tile. */
export type BreakNames = Record<ParticipantSlot, string>;

/** Each slot's tile, as a box to centre a per-debater piece in. */
const TILE_CLASS: Record<ParticipantSlot, string> = {
  1: 'absolute inset-x-0 top-0 h-1/2',
  2: 'absolute inset-x-0 bottom-0 h-1/2',
};

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

/** Open rounds playback shows one outlined round or wrap announcement per break. */
export function DebateBreakOverlay({
  cue,
  roundTurns,
  playing,
  clock,
  sharedClock = false,
}: {
  cue: BreakCue | null;
  sharedClock?: boolean;
  roundTurns: TurnCount;
  playing: boolean;
  clock?: { positionMs: () => number | null; originMs: number; resetKey?: string | number };
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePlaybackAnimationClock(ref, sharedClock ? null : cue, playing, clock);
  if (!cue) return null;

  const wrap = cue.kind === 'final_end';
  const nextRound = roundParts((cue.nextRoundIndex ?? 0) * 2, roundTurns);

  return (
    <div ref={ref} aria-hidden data-debate-break={cue.kind} className="pointer-events-none absolute inset-0 z-[22]">
      {/* The dim and title enter together on the shared playback clock. */}
      <div
        data-debate-dim-out
        className={cx('absolute inset-0', !wrap && PLAYER_EXIT_CLASS)}
        style={wrap ? undefined : heldAt(Math.max(0, cue.playedMs - PLAYER_EXIT_MS))}
      >
        <div
          data-debate-dim
          className={cx('absolute inset-0 bg-black/42', PLAYER_FADE_CLASS)}
          style={heldAt(BREAK_SETTLE_MS)}
        />
      </div>
      <div
        data-debate-banner-out
        // The wrap holds; a next-round announcement fades before the cut.
        className={cx('absolute inset-x-0 top-1/2 -translate-y-1/2', !wrap && PLAYER_EXIT_CLASS)}
        style={wrap ? undefined : heldAt(cue.playedMs - PLAYER_EXIT_MS)}
      >
        <div
          data-debate-banner={wrap ? 'wrap' : 'round'}
          className={cx(PLAYER_ENTER_CLASS, 'text-center')}
          style={heldAt(BREAK_SETTLE_MS)}
        >
          {wrap ? (
            <div className={cx(PLAYER_TITLE_CLASS, 'text-[11cqw]')} style={PLAYER_TITLE_STYLE}>
              That’s a wrap
            </div>
          ) : (
            <PlayerRoundTitle {...nextRound} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Early ends use level glass pills and fade away with the dim. */
export function DebateEarlyEndLabels({
  cue,
  names,
  playing,
  clock,
}: {
  cue: EarlyEndCue | null;
  names: BreakNames;
  playing: boolean;
  clock?: { positionMs: () => number | null; originMs: number; resetKey?: string | number };
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePlaybackAnimationClock(ref, cue ? { elapsedMs: cue.ageMs, playedMs: cue.durationMs } : null, playing, clock);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[22]">
      <RoomExit>
        {cue && (
          // The debater who ended is dimmed under their stamp, as in the mockup.
          <div data-debate-early-end className={cx(TILE_CLASS[cue.endedSlot], 'grid place-items-center')}>
            <div className={cx('absolute inset-0 bg-black/42', PLAYER_FADE_CLASS)} style={heldAt(0)} />
            <span
              data-debate-stamp="ended"
              className={cx(PLAYER_PICK_BASE_CLASS, PLAYER_PICK_CLASS.none, PLAYER_ENTER_CLASS, 'relative')}
              style={{ ...PLAYER_PICK_STYLE, ...heldAt(0) }}
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
              className={cx(PLAYER_PICK_BASE_CLASS, PLAYER_PICK_CLASS.end, PLAYER_ENTER_CLASS, 'max-w-[90%] truncate')}
              style={{ ...PLAYER_PICK_STYLE, ...heldAt(600) }}
            >
              {names[cue.nextSlot]}’s turn
            </div>
          </div>
        )}
      </RoomExit>
    </div>
  );
}
