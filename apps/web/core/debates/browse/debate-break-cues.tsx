'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ParticipantSlot } from '~/core/debates/api';
import { RoomExit } from '~/core/debates/debate-room-stamps';
import { openRoundWrapNote } from '~/core/debates/open-round-reveal';
import {
  BREAK_QUESTION_MS,
  BREAK_SETTLE_MS,
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
  PLAYER_FADE_CLASS,
  PLAYER_LABEL_FONT,
  PLAYER_PICK_BASE_CLASS,
  PLAYER_PICK_CLASS,
  PLAYER_PICK_STYLE,
  PLAYER_TITLE_CLASS,
  PLAYER_TITLE_STYLE,
} from './player-overlay-styles';
import { STAMP_WORD } from './stamp-styles';
import { heldAt, usePlaybackAnimationClock } from './use-playback-animation-clock';

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

/** Open rounds breaks: outlined announcements with glass picks on each debater's video. */
export function DebateBreakOverlay({
  cue,
  names,
  firstSlot,
  roundTurns,
  playing,
  clock,
  sharedClock = false,
}: {
  cue: BreakCue | null;
  sharedClock?: boolean;
  names: BreakNames;
  firstSlot: ParticipantSlot;
  roundTurns: TurnCount;
  playing: boolean;
  clock?: { positionMs: () => number | null; originMs: number; resetKey?: string | number };
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  usePlaybackAnimationClock(ref, sharedClock ? null : cue, playing, clock);
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
      <div
        data-debate-dim-out
        className={cx('absolute inset-0', !wrap && PLAYER_EXIT_CLASS)}
        style={wrap ? undefined : heldAt(Math.max(0, cue.playedMs - BREAK_BANNER_OUT_MS))}
      >
        <div
          data-debate-dim
          className={cx('absolute inset-0 bg-black/42', PLAYER_FADE_CLASS)}
          style={heldAt(BREAK_SETTLE_MS)}
        />
      </div>
      {picks && (
        <div
          data-debate-question-out
          className={cx('absolute inset-0 grid place-items-center px-4 text-center', PLAYER_EXIT_CLASS)}
          // Hold through the vote reveal, then clear the seam for either the round or wrap title.
          style={heldAt(bannerAtMs - BREAK_BANNER_OUT_MS)}
        >
          <div
            data-debate-question
            className={cx(PLAYER_TITLE_CLASS, PLAYER_ENTER_CLASS, 'text-[8cqw]')}
            style={{ ...PLAYER_TITLE_STYLE, ...heldAt(BREAK_SETTLE_MS) }}
          >
            Keep debating?
          </div>
        </div>
      )}

      {picks &&
        SLOTS.map(slot => {
          const key = picks[slot] ?? 'none';
          return (
            <div
              key={slot}
              data-debate-pick-out={slot}
              className={cx(TILE_CLASS[slot], 'grid place-items-center', !wrap && PLAYER_EXIT_CLASS)}
              // Keep both votes under the title, then leave with it at the next-round cut.
              style={wrap ? undefined : heldAt(cue.playedMs - BREAK_BANNER_OUT_MS)}
            >
              <div
                data-debate-pick-recede={slot}
                className="animate-[debatePlayerPickRecede_250ms_linear_both]"
                // The new headline takes priority, while both votes remain readable beneath it.
                // Use the shared media clock so pause and scrub also hold this gentle fade.
                style={heldAt(bannerAtMs)}
              >
                <span
                  data-debate-stamp={key}
                  className={cx(PLAYER_PICK_BASE_CLASS, PLAYER_PICK_CLASS[key], PLAYER_ENTER_CLASS)}
                  style={
                    {
                      ...PLAYER_PICK_STYLE,
                      ...heldAt(BREAK_SETTLE_MS + BREAK_QUESTION_MS),
                    } as React.CSSProperties
                  }
                >
                  {STAMP_WORD[key]}
                </span>
              </div>
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
            className={cx(PLAYER_ENTER_CLASS, 'text-center')}
            style={heldAt(bannerAtMs)}
          >
            {wrap ? (
              <div className={cx(PLAYER_TITLE_CLASS, 'text-[11cqw]')} style={PLAYER_TITLE_STYLE}>
                That’s a wrap
              </div>
            ) : (
              <PlayerRoundTitle {...nextRound} sub={opener} />
            )}
          </div>
        </div>
      )}
      {note && cue.elapsedMs >= bannerAtMs - MOUNT_AHEAD_MS && (
        <div
          className="absolute inset-x-0 top-[calc(50%+9cqw)] animate-[fadeIn_250ms_linear_both] text-center"
          style={heldAt(bannerAtMs + 200)}
        >
          <span
            className="inline-block max-w-[90%] rounded-full bg-black/72 px-[2.8cqw] py-[1.4cqw] text-[2.8cqw] leading-[1.2] tracking-[0.01em] text-white"
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
