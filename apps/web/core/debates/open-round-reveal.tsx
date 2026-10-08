'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';

import type { Debate, OpenRoundPick, OpenRoundRevealedPick, ParticipantSlot } from './api';
import { rebuttalRoundsLabel } from './debate-round-indicator';
import { recordingLabelTextShadow, recordingOverlayTextShadow } from './debate-video-tile';
import { type OpenRoundsRoomPhase, openRoundRevealedPicks } from './open-rounds';

/**
 * The Open rounds reveal (GEO-3179): the result window after a round resolves (`result_window_ms`,
 * 3 s today), on both screens at once because both time it from the server's
 * `decision_resolved_at`.
 *
 * - `flip`: each tile's card turns from the debater's name to their pick.
 * - `result`: what the picks mean, for the rest of the window. Two Extends: "Round N" and who opens
 *   it. Anything else: "That's a wrap", with the picks left up so the split explains itself.
 * - `countIn`: Extend only, after the window. The opener gets the room's usual 5 s count-in, which
 *   geo-chat adds after the window as `extend_count_in_ms`.
 *
 * The flip is a share of the window rather than a fixed time, so a longer window lengthens both.
 */
export type OpenRoundRevealStep = 'flip' | 'result' | 'countIn';

/** The share of the window the picks have to turn and be read before the result takes over. */
const OPEN_ROUND_FLIP_SHARE = 0.45;

/**
 * How long "That's a wrap" stays up into thanking, before the end card. An End has nothing to start
 * on time after it, so it can hold past the window; an Extend cannot.
 */
const OPEN_ROUND_WRAP_HOLD_MS = 1_500;

function flipEndsMs(windowMs: number) {
  return Math.round(windowMs * OPEN_ROUND_FLIP_SHARE);
}

export function openRoundRevealStep(elapsedMs: number, outcome: OpenRoundPick, windowMs: number): OpenRoundRevealStep {
  if (elapsedMs < flipEndsMs(windowMs)) return 'flip';
  return outcome === 'extend' && elapsedMs >= windowMs ? 'countIn' : 'result';
}

/**
 * The reveal step for a result window `elapsedMs` into it, or `null` outside one.
 *
 * The room's countdown only ticks every 500 ms, which would let the two screens change step up to
 * half a second apart. This schedules its own re-render at each step boundary instead, measured from
 * the last `elapsedMs` the room gave it.
 */
export function useOpenRoundRevealStep(elapsedMs: number | null, outcome: OpenRoundPick | null, windowMs: number) {
  const [reached, setReached] = React.useState<{ from: number; to: number } | null>(null);
  // The room stays mounted across rounds, and every round passes through `null` between reveals, so
  // forget the last boundary there. Otherwise a later round whose first sample lands on the same
  // `from` would start past its flip.
  if (elapsedMs === null && reached !== null) setReached(null);
  const effectiveMs = elapsedMs === null ? null : reached?.from === elapsedMs ? reached.to : elapsedMs;

  React.useEffect(() => {
    if (elapsedMs === null || effectiveMs === null) return;
    const next = [flipEndsMs(windowMs), windowMs].find(boundary => boundary > effectiveMs);
    if (next === undefined) return;
    const timer = window.setTimeout(() => setReached({ from: elapsedMs, to: next }), next - effectiveMs);
    return () => window.clearTimeout(timer);
  }, [elapsedMs, effectiveMs, windowMs]);

  if (effectiveMs === null || outcome === null) return null;
  return openRoundRevealStep(effectiveMs, outcome, windowMs);
}

/**
 * One debater's pick, as a card over their tile that flips once, on mount, from their name to the
 * pick. A missing pick counted as End, so it flips to End and says it was no pick, which is what
 * makes it clear why the debate ended.
 *
 * `placement` moves the card off the tile's centre while result text is up between the two tiles:
 * the upper tile's card rises, the lower one's drops.
 */
export function OpenRoundPickReveal({
  name,
  pick,
  placement = 'center',
}: {
  name: string;
  pick: OpenRoundPick | null;
  placement?: 'center' | 'raised' | 'lowered';
}) {
  const word = pick === 'extend' ? 'Extend' : 'End';
  return (
    <div
      aria-hidden="true"
      data-open-round-reveal={pick ?? 'none'}
      className={cx(
        'pointer-events-none absolute left-1/2 z-[35] h-[3.75rem] w-32 -translate-x-1/2 -translate-y-1/2 transition-[top] duration-300 perspective-[600px] motion-reduce:transition-none',
        placement === 'raised' ? 'top-[36%]' : placement === 'lowered' ? 'top-[66%]' : 'top-1/2'
      )}
    >
      <div className="relative h-full w-full rotate-y-180 transform-3d motion-safe:animate-open-round-flip">
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-white bg-[repeating-linear-gradient(45deg,var(--color-grey-01)_0_6px,var(--color-white)_6px_12px)] px-2 shadow-card backface-hidden">
          <Text variant="metadataMedium" color="grey-04" className="max-w-full truncate">
            {name}
          </Text>
        </div>
        <div
          className={cx(
            'absolute inset-0 flex rotate-y-180 flex-col items-center justify-center rounded-lg px-2 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backface-hidden',
            pick === 'extend' ? 'bg-purple' : 'bg-text'
          )}
        >
          <span className="max-w-full truncate text-[0.6875rem] leading-[0.8125rem] font-medium tracking-[0.06em] uppercase opacity-80">
            {pick === null ? 'No pick' : name}
          </span>
          <span className="text-[1.375rem] leading-6 font-bold tracking-[0.04em] uppercase">{word}</span>
        </div>
      </div>
    </div>
  );
}

export type OpenRoundResult =
  /** `opener` is the opener's name, or `null` when it is you. */
  | { kind: 'round'; round: number; opener: string | null }
  | { kind: 'wrap'; note: string | null }
  | { kind: 'max'; rounds: number };

/**
 * What a round's resolution means, over the middle of the two tiles: a new round and who opens it,
 * the end of the debate, or the cap. It sits on the gap between the tiles, which is where the
 * room's other cards go, and the tiles hide their chips while it is up so the two never meet.
 */
export function OpenRoundResultOverlay({ result }: { result: OpenRoundResult }) {
  const pill =
    result.kind === 'round'
      ? openRoundOpenerLine(result.opener)
      : result.kind === 'wrap'
        ? result.note
        : rebuttalRoundsLabel(result.rounds);

  return (
    <div data-open-round-result={result.kind} className="pointer-events-none absolute inset-0 z-[45]">
      {result.kind === 'round' && (
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden rounded-lg motion-reduce:hidden">
          <div className="absolute top-1/2 left-1/2 -mt-[260px] -ml-[260px] h-[520px] w-[520px] bg-[repeating-conic-gradient(from_0deg,rgb(104_51_255/0.5)_0_7deg,transparent_7deg_18deg)] [mask-image:radial-gradient(circle,#000_0_18%,transparent_55%)] motion-safe:animate-open-round-burst" />
        </div>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <div
          className="text-recordingLabel text-text motion-safe:animate-open-round-slam"
          style={recordingLabelTextShadow}
        >
          {result.kind === 'round' ? 'Round' : result.kind === 'wrap' ? "That's a wrap" : "That's the max"}
        </div>
        {result.kind === 'round' && (
          <div
            className="mt-1 text-[7.5rem] leading-[0.85] font-bold text-white motion-safe:animate-open-round-slam"
            style={recordingOverlayTextShadow}
          >
            {result.round}
          </div>
        )}
        {pill && (
          <Text
            color="white"
            variant="metadata"
            className="mt-3 max-w-full rounded-xl border border-white/40 bg-black/70 px-3 py-1.5 text-balance shadow-light"
          >
            {pill}
          </Text>
        )}
      </div>
    </div>
  );
}

/** "You open", "Alice opens". */
function openRoundOpenerLine(opener: string | null) {
  return opener === null ? 'You open' : `${opener} opens`;
}

/** Why a debate ended, when the reason is a missing pick. A split needs no line: the cards say it. */
export function openRoundWrapNote(
  localPick: OpenRoundPick | null | undefined,
  remote: { name: string; pick: OpenRoundPick | null | undefined }
) {
  const localMissed = localPick === null;
  const remoteMissed = remote.pick === null;
  if (localMissed && remoteMissed) return 'No picks in time';
  if (localMissed) return "You didn't pick in time";
  if (remoteMissed) return `${remote.name} didn't pick in time`;
  return null;
}

type OpenRoundRevealInput = {
  debate: Pick<Debate, 'open_rounds' | 'first_participant_slot'>;
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
  /** Each debater's pick card, while the cards are up. */
  localPick: OpenRoundRevealedPick | null;
  remotePick: OpenRoundRevealedPick | null;
  /** Where the cards sit: centred while they turn, then clear of the result text. */
  pickPlacement: 'center' | 'apart';
  /** The tiles fade their chips while result text sits between them. */
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
  const windowMs = openRounds?.result_window_ms ?? 0;
  const resultPhase = phase?.phase === 'result' ? phase : null;
  const thankingStarted =
    openRounds !== null && effectiveStatus === 'thanking' && phase?.phase === 'finished' && remainingSeconds > 0;
  const maxReached = thankingStarted && phase.isFinalRound && elapsedMs < windowMs;
  const wrapHeld = thankingStarted && !phase.isFinalRound && elapsedMs < OPEN_ROUND_WRAP_HOLD_MS;

  const timedStep = useOpenRoundRevealStep(resultPhase ? elapsedMs : null, resultPhase?.outcome ?? null, windowMs);
  const step: OpenRoundRevealStep | null = wrapHeld ? 'result' : timedStep;
  const roundIndex = resultPhase?.roundIndex ?? (wrapHeld ? phase.roundIndex : null);
  const outcome = resultPhase?.outcome ?? (wrapHeld ? 'end' : null);

  const picks = openRounds && roundIndex !== null ? openRoundRevealedPicks(openRounds, roundIndex) : null;
  const pickFor = (slot: ParticipantSlot | null) => picks?.find(entry => entry.participant_slot === slot) ?? null;
  const localPick = pickFor(localSlot);
  const remotePick = pickFor(remote.slot);

  const localOpens = localSlot === debate.first_participant_slot;
  // The opener's own tile counts them in; the other debater keeps the announcement until then.
  const announcing = step === 'result' || (step === 'countIn' && !localOpens);
  let result: OpenRoundResult | null = null;
  if (maxReached) {
    result = { kind: 'max', rounds: openRounds?.max_rebuttal_rounds ?? 0 };
  } else if (roundIndex !== null && announcing) {
    result =
      outcome === 'extend'
        ? // The first slot opens every round, and is one of the two debaters.
          { kind: 'round', round: roundIndex + 1, opener: localOpens ? null : remote.name }
        : { kind: 'wrap', note: openRoundWrapNote(localPick?.pick, { name: remote.name, pick: remotePick?.pick }) };
  }

  // The picks turn, then stay up beside "That's a wrap" so a split explains itself. A new round
  // takes the tiles back for its own text.
  const picksShown = step === 'flip' || (step === 'result' && outcome === 'end');
  const newRound = resultPhase?.outcome === 'extend' && (step === 'result' || step === 'countIn');

  return {
    step,
    result,
    localPick: picksShown ? localPick : null,
    remotePick: picksShown ? remotePick : null,
    pickPlacement: step === 'flip' ? 'center' : 'apart',
    chipsHidden: result !== null,
    holdsEndCard: maxReached || wrapHeld,
    holdsCountIn: resultPhase !== null && step !== 'countIn',
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
 * The reveal for screen readers, which cannot see the cards turn: both picks, then what they mean.
 * A missing pick is said as such, since it is why the debate ended.
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
  const said = (entry: OpenRoundRevealedPick | null) =>
    entry === null ? null : entry.pick === null ? 'no pick' : entry.pick === 'extend' ? 'Extend' : 'End';
  const picks = [
    said(localPick) && `You: ${said(localPick)}.`,
    said(remote.pick) && `${remote.name}: ${said(remote.pick)}.`,
  ]
    .filter(Boolean)
    .join(' ');
  // Held from the flip onwards, so the region does not re-announce the picks at every step.
  if (step === 'flip' || !result) return picks;
  if (result.kind === 'round') return `${picks} Round ${result.round}. ${openRoundOpenerLine(result.opener)}.`;
  return `${picks} That's a wrap.${result.note ? ` ${result.note}.` : ''}`;
}
