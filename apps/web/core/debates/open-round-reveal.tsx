'use client';

import * as React from 'react';

import cx from 'classnames';

import type { Debate, OpenRoundPick, OpenRoundRevealedPick, ParticipantSlot } from './api';
import { PlayerRoundTitle } from './browse/debate-round-cues';
import { PLAYER_TITLE_CLASS, PLAYER_TITLE_STYLE } from './browse/player-overlay-styles';
import { LABEL_FONT, STAMP_WORD } from './browse/stamp-styles';
import {
  ROOM_MOMENT_ENTER_CLASS,
  ROOM_PILL_ENTER_CLASS,
  ROOM_UI_FONT,
  RoomTag,
  RoomTilePill,
} from './debate-room-stamps';
import { rebuttalRoundsLabel } from './debate-round-indicator';
import {
  type OpenRoundsRoomPhase,
  debateTurnRoleForDebate,
  openRoundCountInMs,
  openRoundNumber,
  openRoundRevealedPicks,
} from './open-rounds';
import { roundLabel } from './round-cues';

/**
 * The Open rounds reveal (GEO-3179): the result window after a round resolves (`result_window_ms`,
 * 3 s today), on both screens at once because both time it from the server's
 * `decision_resolved_at`.
 *
 * - `flip`: each debater's pick appears on their tile.
 * - `result`: what the picks mean, for the rest of the window. Two Extends: "Round N" and who opens
 *   it, with the picks subdued behind the title. Anything else: "That's a wrap", with the picks
 *   left up so the split explains itself.
 * - `countIn`: Extend only, after the window. The opener gets the room's 3 s count-in, which
 *   geo-chat adds after the window as `extend_count_in_ms`.
 *
 * A required round's lead-in plays the same steps after the round before it, without the flip: there
 * are no picks, so the new round is announced at once and its opener counted in.
 *
 * The flip is a share of the window rather than a fixed time, so a longer window lengthens both.
 */
export type OpenRoundRevealStep = 'flip' | 'result' | 'countIn';

/** The share of the window the picks have to land and be read before the result takes over. */
// GEO-3522: the title occupies 1.05 s of the 3 s result window (was 1.65 s),
// 36% shorter (31% including the unchanged 300 ms exit). Picks stay up for 1.95 s.
const OPEN_ROUND_EXTEND_FLIP_SHARE = 1.95 / 3;
const OPEN_ROUND_END_FLIP_SHARE = 0.45;

/**
 * How long "That's a wrap" stays up into thanking, before the end card. An End has nothing to start
 * on time after it, so it can hold past the window; an Extend cannot.
 */
const OPEN_ROUND_WRAP_HOLD_MS = 1_500;

function flipEndsMs(windowMs: number, outcome: OpenRoundPick | null) {
  return Math.round(windowMs * (outcome === 'extend' ? OPEN_ROUND_EXTEND_FLIP_SHARE : OPEN_ROUND_END_FLIP_SHARE));
}

export function openRoundRevealStep(
  elapsedMs: number,
  outcome: OpenRoundPick,
  windowMs: number,
  hasPicks = true
): OpenRoundRevealStep {
  if (hasPicks && elapsedMs < flipEndsMs(windowMs, outcome)) return 'flip';
  return outcome === 'extend' && elapsedMs >= windowMs ? 'countIn' : 'result';
}

/**
 * The reveal step for a result window `elapsedMs` into it, or `null` outside one.
 *
 * The room's countdown only ticks every 500 ms, which would let the two screens change step up to
 * half a second apart. This schedules its own re-render at each step boundary instead, measured from
 * the last `elapsedMs` the room gave it.
 */
export function useOpenRoundRevealStep(
  elapsedMs: number | null,
  outcome: OpenRoundPick | null,
  windowMs: number,
  hasPicks = true
) {
  const [reached, setReached] = React.useState<{ from: number; to: number } | null>(null);
  // The room stays mounted across rounds, and every round passes through `null` between reveals, so
  // forget the last boundary there. Otherwise a later round whose first sample lands on the same
  // `from` would start past its flip.
  if (elapsedMs === null && reached !== null) setReached(null);
  const effectiveMs = elapsedMs === null ? null : reached?.from === elapsedMs ? reached.to : elapsedMs;

  React.useEffect(() => {
    if (elapsedMs === null || effectiveMs === null) return;
    const next = [flipEndsMs(windowMs, outcome), windowMs].find(boundary => boundary > effectiveMs);
    if (next === undefined) return;
    const timer = window.setTimeout(() => setReached({ from: elapsedMs, to: next }), next - effectiveMs);
    return () => window.clearTimeout(timer);
  }, [elapsedMs, effectiveMs, windowMs, outcome]);

  if (effectiveMs === null || outcome === null) return null;
  return openRoundRevealStep(effectiveMs, outcome, windowMs, hasPicks);
}

/** Each pick fades onto its debater: Extend white, End dark glass, No pick dashed. */
export function OpenRoundPickPill({ pick, subdued = false }: { pick: OpenRoundPick | null; subdued?: boolean }) {
  const key = pick ?? 'none';
  return (
    <div
      aria-hidden="true"
      data-open-round-reveal={key}
      className={cx(
        'pointer-events-none absolute inset-0 z-[35] transition-opacity duration-250 ease-out',
        subdued ? 'opacity-40' : 'opacity-100'
      )}
    >
      <RoomTilePill tone={pick === 'extend' ? 'white' : pick === 'end' ? 'dark' : 'dashed'}>
        {STAMP_WORD[key]}
      </RoomTilePill>
    </div>
  );
}

export type OpenRoundResult =
  /** `opener` is the opener's name, or `null` when it is you. */
  /** `label` is the round in the player's words, "Round 2 · Rebuttal". */
  | { kind: 'round'; round: number; label: string; opener: string | null }
  | { kind: 'wrap'; note: string | null }
  | { kind: 'max'; rounds: number };

/** The next round and its opener, or the ending, in outlined type across the tiles' seam. */
export function OpenRoundResultOverlay({ result }: { result: OpenRoundResult }) {
  const [round, role] = result.kind === 'round' ? result.label.split(' · ') : [];
  return (
    <div data-open-round-result={result.kind} className="pointer-events-none absolute inset-0 z-[45]">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
        <div
          data-open-round-phrase
          className={`${result.kind === 'round' ? ROOM_MOMENT_ENTER_CLASS : ROOM_PILL_ENTER_CLASS} text-center font-bold text-white`}
          style={ROOM_UI_FONT}
        >
          {result.kind === 'round' ? (
            <>
              <PlayerRoundTitle round={round} role={role ?? null} scale={0.78} />
              <span
                className="mx-auto mt-[1.6cqw] block w-max max-w-[92%] truncate text-[3.744cqw] leading-none font-semibold tracking-normal"
                style={PLAYER_TITLE_STYLE}
              >
                {openRoundOpenerLine(result.opener)}
              </span>
            </>
          ) : (
            <span
              className={`${PLAYER_TITLE_CLASS} mx-auto block w-max max-w-[92%] text-[8.58cqw]`}
              style={PLAYER_TITLE_STYLE}
            >
              {result.kind === 'wrap' ? 'That’s a wrap' : 'That’s the max'}
            </span>
          )}
        </div>
      </div>
      {result.kind === 'wrap' && result.note && (
        <div
          className="absolute inset-x-0 top-[calc(50%+9cqw)] animate-[fadeIn_250ms_linear_both] px-4 text-center"
          style={{ animationDelay: '200ms' }}
        >
          <span
            className="inline-block max-w-full rounded-full bg-black/72 px-[2.8cqw] py-[1.4cqw] text-[2.8cqw] leading-[1.2] font-medium tracking-[0.01em] text-balance text-white"
            style={LABEL_FONT}
          >
            {result.note}
          </span>
        </div>
      )}
      {result.kind === 'max' && (
        <div className="absolute inset-x-0 top-[calc(50%+7.5cqw)] text-center">
          {/* Every round run, the opening included, as the mockup counts them. */}
          <RoomTag className="text-[3cqw]">{openRoundNumber(result.rounds)} rounds</RoomTag>
        </div>
      )}
    </div>
  );
}

/** "You open", "Alice opens". */
function openRoundOpenerLine(opener: string | null) {
  return opener === null ? 'You open' : `${opener} opens`;
}

/**
 * Why a debate ended, when nobody picked End: the missing picks. An End ends the debate whatever the
 * other pick was, so when there is one the picks already say why, and there is no line.
 */
export function openRoundWrapNote(
  localPick: OpenRoundPick | null | undefined,
  remote: { name: string; pick: OpenRoundPick | null | undefined },
  /** The first side's name where there is no "you", as in published playback (GEO-3277). */
  localName = 'You'
) {
  if (localPick === 'end' || remote.pick === 'end') return null;
  const localMissed = localPick === null;
  const remoteMissed = remote.pick === null;
  if (localMissed && remoteMissed) return 'No picks in time';
  if (localMissed) return `${localName} didn't pick in time`;
  if (remoteMissed) return `${remote.name} didn't pick in time`;
  return null;
}

type OpenRoundRevealInput = {
  debate: Pick<Debate, 'open_rounds' | 'first_participant_slot' | 'turn_durations_ms'>;
  /** The room's Open rounds phase; `null` for a fixed format. */
  phase: OpenRoundsRoomPhase | null;
  effectiveStatus: Debate['status'];
  /** How far into the room's current countdown window, and what is left of it. */
  elapsedMs: number;
  remainingSeconds: number;
  localSlot: ParticipantSlot | null;
  remote: { slot: ParticipantSlot | null; name: string };
};

export type OpenRoundReveal = {
  step: OpenRoundRevealStep | null;
  /** What the resolution means, for the overlay between the tiles; `null` when nothing is up. */
  result: OpenRoundResult | null;
  /** Each debater's pick, while the reveal is up. */
  localPick: OpenRoundRevealedPick | null;
  remotePick: OpenRoundRevealedPick | null;
  /** Classic room boards keep the corner chips visible under the centered announcements. */
  chipsHidden: boolean;
  /** The end card and the thank-you overlay wait while the debate's last result is still up. */
  holdsEndCard: boolean;
  /** The opener's count-in waits until the new round has been announced. */
  holdsCountIn: boolean;
  /** The round the counter shows once a new round is announced, else `null` to follow the room. */
  announcedRoundPhase: OpenRoundsRoomPhase | null;
  /** The reveal for screen readers. */
  announcement: string;
};

/**
 * Whether the debate's last result is still up in the first moments of thanking: "That's the max"
 * after the cap round, for a result window, or "That's a wrap" after an End, for
 * `OPEN_ROUND_WRAP_HOLD_MS`. Pure, so the room can hold its exit to the claim picker on the same
 * answer the reveal draws from (GEO-3301); both rooms consent the moment thanking starts, and the
 * pair would otherwise leave mid-reveal.
 */
export function openRoundThankingHold({
  debate,
  phase,
  effectiveStatus,
  elapsedMs,
  remainingSeconds,
}: Pick<OpenRoundRevealInput, 'debate' | 'phase' | 'effectiveStatus' | 'elapsedMs' | 'remainingSeconds'>): {
  maxReached: boolean;
  wrapHeld: boolean;
} {
  const openRounds = debate.open_rounds ?? null;
  const thankingStarted =
    openRounds !== null && effectiveStatus === 'thanking' && phase?.phase === 'finished' && remainingSeconds > 0;
  if (!thankingStarted) return { maxReached: false, wrapHeld: false };
  return {
    maxReached: phase.isFinalRound && elapsedMs < openRounds.result_window_ms,
    wrapHeld: !phase.isFinalRound && elapsedMs < OPEN_ROUND_WRAP_HOLD_MS,
  };
}

/**
 * Everything the room draws for the reveal (GEO-3179), from the room's own clock.
 *
 * Three moments use it. A round's result window after it resolves; then, after an End, the first
 * moments of thanking ("That's a wrap" holds there before the end card, since nothing has to start
 * on time after it); and after the cap round, which goes straight to thanking with no pick, the
 * first result window of thanking ("That's the max").
 */
export function useOpenRoundReveal({
  debate,
  phase,
  effectiveStatus,
  elapsedMs,
  remainingSeconds,
  localSlot,
  remote,
}: OpenRoundRevealInput): OpenRoundReveal {
  const openRounds = debate.open_rounds ?? null;
  const resultPhase = phase?.phase === 'result' ? phase : null;
  const leadIn = resultPhase?.leadIn === true;
  // A lead-in's announcement runs until the count-in, which takes the end of the pause as it does
  // after an Extend.
  const windowMs =
    leadIn && openRounds
      ? Math.max(0, resultPhase.nextPhaseStartsAtMs - resultPhase.resolvedAtMs - openRoundCountInMs(openRounds))
      : (openRounds?.result_window_ms ?? 0);
  const { maxReached, wrapHeld } = openRoundThankingHold({
    debate,
    phase,
    effectiveStatus,
    elapsedMs,
    remainingSeconds,
  });

  const timedStep = useOpenRoundRevealStep(
    resultPhase ? elapsedMs : null,
    resultPhase?.outcome ?? null,
    windowMs,
    !leadIn
  );
  const step: OpenRoundRevealStep | null = wrapHeld ? 'result' : timedStep;
  const roundIndex = resultPhase?.roundIndex ?? (wrapHeld && phase?.phase === 'finished' ? phase.roundIndex : null);
  const outcome = resultPhase?.outcome ?? (wrapHeld ? 'end' : null);

  const picks = openRounds && roundIndex !== null ? openRoundRevealedPicks(openRounds, roundIndex) : null;
  const pickFor = (slot: ParticipantSlot | null) => picks?.find(entry => entry.participant_slot === slot) ?? null;
  const localPick = pickFor(localSlot);
  const remotePick = pickFor(remote.slot);

  const localOpens = localSlot === debate.first_participant_slot;
  // The count-in counts into the new round's first turn, so it needs that turn. A payload that has
  // not caught up with an Extend holds on the result without it (`openRoundGapAfterTurn`), and the
  // announcement stays up rather than leave a blank screen.
  const countingIn = step === 'countIn' && roundIndex !== null && debate.turn_durations_ms.length > roundIndex * 2 + 2;
  // Clear the title on both screens before the count-in. A stale payload still holds it
  // until it includes the next round, so the opener never falls into an invented turn.
  const announcing = step === 'result' || (step === 'countIn' && !countingIn);
  let result: OpenRoundResult | null = null;
  if (maxReached) {
    result = { kind: 'max', rounds: openRounds?.max_rebuttal_rounds ?? 0 };
  } else if (roundIndex !== null && announcing) {
    result =
      outcome === 'extend'
        ? // The first slot opens every round, and is one of the two debaters.
          {
            kind: 'round',
            round: openRoundNumber(roundIndex + 1),
            label: roundLabel((roundIndex + 1) * 2, turnIndex => debateTurnRoleForDebate(debate, turnIndex)),
            opener: localOpens ? null : remote.name,
          }
        : { kind: 'wrap', note: openRoundWrapNote(localPick?.pick, { name: remote.name, pick: remotePick?.pick }) };
  }

  // Keep the votes behind the result, including a new round's title. The opener clears both picks
  // with the title for the count-in on both screens.
  // A required round's lead-in has no vote to reveal.
  const picksShown = !leadIn && (step === 'flip' || result?.kind === 'round' || result?.kind === 'wrap');
  const newRound = resultPhase?.outcome === 'extend' && (step === 'result' || step === 'countIn');

  return {
    step,
    result,
    localPick: picksShown ? localPick : null,
    remotePick: picksShown ? remotePick : null,
    chipsHidden: false,
    holdsEndCard: maxReached || wrapHeld,
    holdsCountIn: resultPhase !== null && !countingIn,
    announcedRoundPhase:
      newRound && openRounds
        ? {
            phase: 'speaking',
            roundIndex: resultPhase.roundIndex + 1,
            isFinalRound: resultPhase.roundIndex + 1 >= openRounds.max_rebuttal_rounds,
          }
        : null,
    announcement: openRoundAnnouncementText({
      step,
      result,
      localPick,
      remote: { name: remote.name, pick: remotePick },
    }),
  };
}

/**
 * The reveal for screen readers, which cannot see the pick pills: both picks, then what they mean.
 * A missing pick is said as such, since it can be why the debate ended.
 */
function openRoundAnnouncementText({
  step,
  result,
  localPick,
  remote,
}: {
  step: OpenRoundRevealStep | null;
  result: OpenRoundResult | null;
  localPick: OpenRoundRevealedPick | null;
  remote: { name: string; pick: OpenRoundRevealedPick | null };
}) {
  if (result?.kind === 'max') return `That's the max: ${rebuttalRoundsLabel(result.rounds)}.`;
  if (step === null) return '';
  // Mid-sentence, so a missing pick is lower case.
  const said = (entry: OpenRoundRevealedPick | null) =>
    entry === null ? null : entry.pick === null ? 'no pick' : STAMP_WORD[entry.pick];
  const picks = [
    said(localPick) && `You: ${said(localPick)}.`,
    said(remote.pick) && `${remote.name}: ${said(remote.pick)}.`,
  ]
    .filter(Boolean)
    .join(' ');
  // Held from the flip onwards, so the region does not re-announce the picks at every step.
  if (step === 'flip' || !result) return picks;
  // A lead-in has no picks, so its announcement starts at the round.
  const meaning =
    result.kind === 'round'
      ? `Round ${result.round}. ${openRoundOpenerLine(result.opener)}.`
      : `That's a wrap.${result.note ? ` ${result.note}.` : ''}`;
  return [picks, meaning].filter(Boolean).join(' ');
}
