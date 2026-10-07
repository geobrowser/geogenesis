import type { Debate, DebateOpenRounds, OpenRoundPick, OpenRoundRevealedPick } from './api';
import { type DebateTurnRole, debateTurnRole } from './formats';

/**
 * The room's clock for Open rounds (GEO-3175), against geo-chat `docs/open-rounds-contract.md`.
 *
 * A fixed format knows its whole timeline at the start: the turns in `turn_durations_ms`, end to
 * end, then thanking. Open rounds does not. After each round both debaters pick Extend or End, the
 * round resolves, and only then does the server append the next round's turns — so the timeline
 * has a gap after every round (deciding, then a 3 s result window) and its end is unknown until a
 * round resolves End or the cap round is reached.
 *
 * Everything here answers "nothing changes" for a debate without an `open_rounds` block, which is
 * every fixed format. That is how the room keeps fixed formats exactly as they were.
 */

type OpenRoundsTimingDebate = Pick<
  Debate,
  'turn_durations_ms' | 'open_rounds' | 'current_turn_index' | 'turn_started_at' | 'status'
>;

/**
 * What the room is doing in an Open rounds debate, from the room's own clock rather than the
 * server's `phase` (which is the server's reading at `as_of`, and lags by up to a 2 s sweep).
 *
 * This is the one place the pick bar, pick card and reveal read the phase from. `roundIndex` is the
 * round the phase is about — in `result` it is the round that just resolved, as in the contract — so
 * it is also the round to send a pick for.
 */
export type OpenRoundsRoomPhase =
  | { phase: 'speaking'; roundIndex: number; isFinalRound: boolean }
  | {
      phase: 'deciding';
      roundIndex: number;
      isFinalRound: false;
      /** When the round's last turn ended. */
      roundEndedAtMs: number;
      /** `roundEndedAtMs + decision_window_ms`. Past it the room waits for the server's verdict. */
      decisionDeadlineAtMs: number;
    }
  | {
      phase: 'result';
      roundIndex: number;
      isFinalRound: false;
      outcome: OpenRoundPick;
      resolvedAtMs: number;
      /** The next round's first turn, or thanking, starts here. */
      nextPhaseStartsAtMs: number;
    }
  | { phase: 'finished'; roundIndex: number; isFinalRound: boolean };

/** What follows a turn, on the room's clock. */
export type OpenRoundGap =
  /** Nothing in between: the next turn (or, after the last one, thanking) starts here. */
  | { kind: 'continue'; nextTurnStartsAtMs: number }
  /** The round resolved End and its result window is over. */
  | { kind: 'thanking'; startsAtMs: number }
  /** The round is deciding, or in its result window: the room holds here. */
  | { kind: 'hold'; phase: Extract<OpenRoundsRoomPhase, { phase: 'deciding' | 'result' }> };

export function isOpenRoundsDebate<T extends Pick<Debate, 'open_rounds'>>(
  debate: T
): debate is T & { open_rounds: DebateOpenRounds } {
  return debate.open_rounds !== undefined && debate.open_rounds !== null;
}

/** Round `r` holds turns `2r` and `2r + 1`. */
export function openRoundIndexForTurn(turnIndex: number) {
  return Math.floor(Math.max(0, turnIndex) / 2);
}

export function isFinalOpenRound(openRounds: Pick<DebateOpenRounds, 'max_rebuttal_rounds'>, roundIndex: number) {
  return roundIndex >= openRounds.max_rebuttal_rounds;
}

/**
 * Whether thanking follows this turn directly. For a fixed format that is its last turn. For Open
 * rounds it is only the second turn of the cap round: every other round's last turn is followed by
 * a decision, so "Debate ends soon" never belongs on it.
 */
export function isDebatesLastTurn(debate: Pick<Debate, 'turn_durations_ms' | 'open_rounds'>, turnIndex: number) {
  if (turnIndex !== debate.turn_durations_ms.length - 1) return false;
  if (!isOpenRoundsDebate(debate)) return true;
  return turnIndex % 2 === 1 && isFinalOpenRound(debate.open_rounds, openRoundIndexForTurn(turnIndex));
}

/**
 * How many rebuttal rounds an Open rounds debate unlocked (GEO-3180): `0` for one that ended after
 * the opening, `null` for a fixed format, which has no rounds to count. Read off the last appended
 * turn rather than `rounds[]`: only an Extend appends a round, so the appended turns are exactly
 * the rounds both debaters agreed to — including the cap round, which never resolves into
 * `rounds[]`. Round 0 is the opening, so the last turn's round is the rebuttal count.
 */
export function openRebuttalRoundCount(debate: Pick<Debate, 'turn_durations_ms' | 'open_rounds'>): number | null {
  if (!isOpenRoundsDebate(debate)) return null;
  return openRoundIndexForTurn(debate.turn_durations_ms.length - 1);
}

/**
 * Both picks of a resolved round, for the reveal (GEO-3179). `rounds[]` lists every resolved round;
 * in the result window the block itself also carries the round that just resolved, which is the one
 * a payload written in the same transaction as the resolution has. `null` until the round resolves.
 */
export function openRoundRevealedPicks(
  openRounds: Pick<DebateOpenRounds, 'rounds' | 'round_index' | 'revealed_picks'>,
  roundIndex: number
): OpenRoundRevealedPick[] | null {
  const history = openRounds.rounds?.find(round => round.round_index === roundIndex);
  if (history?.picks?.length) return history.picks;
  if (openRounds.round_index === roundIndex && openRounds.revealed_picks?.length) return openRounds.revealed_picks;
  return null;
}

/**
 * Whether the second turn of a round is running, which every round but the cap ends on a pick, so
 * whoever speaks it has the last word before both decide (GEO-3179). The cap round's second turn
 * is the last word of the whole debate.
 */
export function openRoundLastWord(
  debate: Pick<Debate, 'turn_durations_ms' | 'open_rounds'>,
  turnIndex: number | null
): 'round' | 'debate' | null {
  if (!isOpenRoundsDebate(debate) || turnIndex === null || turnIndex % 2 !== 1) return null;
  return isFinalOpenRound(debate.open_rounds, openRoundIndexForTurn(turnIndex)) ? 'debate' : 'round';
}

/**
 * What a turn is. Open rounds sends `turn_roles`, one per appended turn, and it is read as given;
 * every fixed format keeps `debateTurnRole`'s position rule (GEO-2852).
 */
export function debateTurnRoleForDebate(
  debate: Pick<Debate, 'turn_durations_ms' | 'open_rounds'>,
  turnIndex: number
): DebateTurnRole {
  if (!isOpenRoundsDebate(debate)) return debateTurnRole(turnIndex, debate.turn_durations_ms.length);
  const role = debate.open_rounds.turn_roles?.[turnIndex];
  if (role) return role;
  return openRoundIndexForTurn(turnIndex) === 0 ? 'opening' : 'rebuttal';
}

/**
 * What follows `turnIndex`, which ended at `turnEndsAtMs`, at `nowMs`.
 *
 * Fixed formats, the first turn of a round and the cap round's last turn answer `continue` at
 * `turnEndsAtMs`, which is exactly what the room did before Open rounds existed. Otherwise the turn
 * ended a round, and the round is deciding until it resolves, then in its result window until
 * `decision_resolved_at + result_window_ms`, then either the next round (`continue`) or thanking.
 *
 * An unresolved round stays `deciding` however late it gets: the room never falls through to
 * thanking because the last appended turn ended. Only the server's outcome ends a debate.
 */
export function openRoundGapAfterTurn(
  debate: OpenRoundsTimingDebate,
  turnIndex: number,
  turnEndsAtMs: number,
  nowMs: number
): OpenRoundGap {
  const proceed: OpenRoundGap = { kind: 'continue', nextTurnStartsAtMs: turnEndsAtMs };
  if (!isOpenRoundsDebate(debate) || turnIndex % 2 !== 1) return proceed;

  const openRounds = debate.open_rounds;
  const roundIndex = openRoundIndexForTurn(turnIndex);
  if (isFinalOpenRound(openRounds, roundIndex)) return proceed;

  const decisionDeadlineAtMs = turnEndsAtMs + openRounds.decision_window_ms;
  const deciding: OpenRoundGap = {
    kind: 'hold',
    phase: { phase: 'deciding', roundIndex, isFinalRound: false, roundEndedAtMs: turnEndsAtMs, decisionDeadlineAtMs },
  };

  const resolution = openRoundResolution(debate, roundIndex, turnEndsAtMs);
  if (!resolution || nowMs < resolution.resolvedAtMs) return deciding;

  const nextPhaseStartsAtMs = resolution.resolvedAtMs + openRounds.result_window_ms;
  const nextRoundAppended = turnIndex + 1 < debate.turn_durations_ms.length;
  // An Extend appends the next round in the same transaction that writes it, so an Extend without the
  // next round's turns is a payload that has not caught up; hold on the result rather than invent
  // turns or fall into thanking.
  if (nowMs < nextPhaseStartsAtMs || (resolution.outcome === 'extend' && !nextRoundAppended)) {
    return {
      kind: 'hold',
      phase: {
        phase: 'result',
        roundIndex,
        isFinalRound: false,
        outcome: resolution.outcome,
        resolvedAtMs: resolution.resolvedAtMs,
        nextPhaseStartsAtMs,
      },
    };
  }

  if (resolution.outcome === 'end') return { kind: 'thanking', startsAtMs: nextPhaseStartsAtMs };
  return { kind: 'continue', nextTurnStartsAtMs: nextPhaseStartsAtMs };
}

/**
 * When a round resolved, and how. `rounds[]` carries every resolved round; the block itself carries
 * the round it describes, which in the result window is the round that just resolved.
 */
function openRoundResolution(
  debate: OpenRoundsTimingDebate & { open_rounds: DebateOpenRounds },
  roundIndex: number,
  roundEndedAtMs: number
): { resolvedAtMs: number; outcome: OpenRoundPick } | null {
  const openRounds = debate.open_rounds;
  const history = openRounds.rounds?.find(round => round.round_index === roundIndex);
  const historyResolvedAtMs = timestampMs(history?.decision_resolved_at ?? null);
  if (history && historyResolvedAtMs !== null) return { resolvedAtMs: historyResolvedAtMs, outcome: history.outcome };

  if (openRounds.round_index === roundIndex && openRounds.outcome) {
    const resolvedAtMs = timestampMs(openRounds.decision_resolved_at);
    if (resolvedAtMs !== null) return { resolvedAtMs, outcome: openRounds.outcome };
  }

  // The next round is already appended, so this one resolved Extend, but its resolution time is
  // missing. Take it from the next turn's server start when that is the running turn; otherwise
  // run the rounds end to end rather than stall.
  const nextTurnIndex = roundIndex * 2 + 2;
  if (nextTurnIndex < debate.turn_durations_ms.length) {
    const nextStartedAtMs = debate.current_turn_index === nextTurnIndex ? timestampMs(debate.turn_started_at) : null;
    const resolvedAtMs = nextStartedAtMs !== null ? nextStartedAtMs - openRounds.result_window_ms : roundEndedAtMs;
    return { resolvedAtMs: Math.max(roundEndedAtMs, resolvedAtMs), outcome: 'extend' };
  }

  return null;
}

/**
 * The room's Open rounds phase from a countdown window the room has already worked out. `null` for
 * a fixed format, so a component can render nothing for one.
 */
export function openRoundsRoomPhase(
  debate: OpenRoundsTimingDebate,
  window: {
    effectiveStatus: Debate['status'];
    turnIndex: number | null;
    openRoundsGap?: OpenRoundGap | null;
  }
): OpenRoundsRoomPhase | null {
  if (!isOpenRoundsDebate(debate)) return null;
  const openRounds = debate.open_rounds;
  const gap = window.openRoundsGap;
  if (gap?.kind === 'hold') return gap.phase;

  if (['thanking', 'complete', 'cancelled'].includes(window.effectiveStatus)) {
    const lastTurnIndex = Math.max(0, debate.turn_durations_ms.length - 1);
    const roundIndex = openRoundIndexForTurn(lastTurnIndex);
    return { phase: 'finished', roundIndex, isFinalRound: isFinalOpenRound(openRounds, roundIndex) };
  }

  const roundIndex =
    window.effectiveStatus === 'in_progress' && window.turnIndex !== null ? openRoundIndexForTurn(window.turnIndex) : 0;
  return { phase: 'speaking', roundIndex, isFinalRound: isFinalOpenRound(openRounds, roundIndex) };
}

/**
 * When thanking starts, on the room's clock, or `null` while it is not yet decided. Recording stops
 * a post-roll after this.
 *
 * `turnEnds` walks the appended turns the way the caller measures them (yields included) and
 * returns each turn's end given its start.
 */
export function debateThankingStartsAtMs(
  debate: OpenRoundsTimingDebate,
  debateStartMs: number,
  turnEndsAtMs: (turnIndex: number, turnStartMs: number, durationMs: number) => number
): number | null {
  let turnStartMs = debateStartMs;
  for (const [turnIndex, durationMs] of debate.turn_durations_ms.entries()) {
    const endMs = turnEndsAtMs(turnIndex, turnStartMs, durationMs);
    const gap = openRoundGapAfterTurn(debate, turnIndex, endMs, Number.POSITIVE_INFINITY);
    if (gap.kind === 'continue') {
      turnStartMs = gap.nextTurnStartsAtMs;
      continue;
    }
    if (gap.kind === 'thanking') return gap.startsAtMs;
    return null;
  }
  return turnStartMs;
}

function timestampMs(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}
