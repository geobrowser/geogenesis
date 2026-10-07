import { describe, expect, it } from 'vitest';

import type { Debate } from './api';
import { debateTurnRole } from './formats';
import {
  debateThankingStartsAtMs,
  debateTurnRoleForDebate,
  isDebatesLastTurn,
  isOpenRoundsDebate,
  openRoundGapAfterTurn,
  openRoundsRoomPhase,
} from './open-rounds';
import {
  CAP_ROUND_ENDS_AT,
  at,
  capRoundLastTurn,
  deciding,
  listening,
  revealEnd,
  revealRebut,
  roundOneSpeaking,
  timedOut,
} from './open-rounds-fixtures';

const naturalTurnEnd = (_turnIndex: number, turnStartMs: number, durationMs: number) => turnStartMs + durationMs;

function fixedDebate(turnDurationsMs: number[]): Debate {
  const { open_rounds: _openRounds, ...rest } = listening();
  return { ...rest, turn_format_id: 'standard', turn_durations_ms: turnDurationsMs };
}

describe('fixed formats', () => {
  const standard = fixedDebate([60_000, 60_000, 45_000, 45_000, 30_000, 30_000]);

  it('are not open rounds', () => {
    expect(isOpenRoundsDebate(standard)).toBe(false);
    expect(openRoundsRoomPhase(standard, { effectiveStatus: 'in_progress', turnIndex: 1 })).toBeNull();
  });

  it('continue straight from every turn into the next, as before', () => {
    for (let turnIndex = 0; turnIndex < 6; turnIndex += 1) {
      expect(openRoundGapAfterTurn(standard, turnIndex, 1_000, 999_999_999)).toEqual({
        kind: 'continue',
        nextTurnStartsAtMs: 1_000,
      });
    }
  });

  it('end on the last index and read roles by position', () => {
    expect([0, 1, 2, 3, 4, 5].map(index => isDebatesLastTurn(standard, index))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect([0, 1, 2, 3, 4, 5].map(index => debateTurnRoleForDebate(standard, index))).toEqual(
      [0, 1, 2, 3, 4, 5].map(index => debateTurnRole(index, 6))
    );
  });

  it('have a known thanking start: the sum of their turns', () => {
    expect(debateThankingStartsAtMs(standard, 0, naturalTurnEnd)).toBe(270_000);
  });
});

describe('open rounds: turn roles and the last turn', () => {
  it('reads turn_roles as sent, rather than calling the last appended round a closing', () => {
    const debate = revealRebut();
    expect([0, 1, 2, 3].map(index => debateTurnRoleForDebate(debate, index))).toEqual([
      'opening',
      'opening',
      'rebuttal',
      'rebuttal',
    ]);
  });

  it('never treats a non-final round as the end of the debate', () => {
    expect(isDebatesLastTurn(listening(), 1)).toBe(false);
    expect(isDebatesLastTurn(revealRebut(), 3)).toBe(false);
  });

  it('treats only the cap round’s last turn as the end', () => {
    const cap = capRoundLastTurn();
    expect(isDebatesLastTurn(cap, 21)).toBe(true);
    expect(isDebatesLastTurn(cap, 20)).toBe(false);
  });
});

describe('open rounds: what follows a round', () => {
  const roundZeroEnd = at('20:02:00.000');

  it('8.1 listening: a round’s first turn is followed by its second', () => {
    expect(openRoundGapAfterTurn(listening(), 0, at('20:01:00.000'), at('20:01:30.000'))).toEqual({
      kind: 'continue',
      nextTurnStartsAtMs: at('20:01:00.000'),
    });
  });

  it('8.2 deciding: holds on the decision, counting to the deadline', () => {
    expect(openRoundGapAfterTurn(deciding(), 1, roundZeroEnd, at('20:02:01.000'))).toEqual({
      kind: 'hold',
      phase: {
        phase: 'deciding',
        roundIndex: 0,
        isFinalRound: false,
        roundEndedAtMs: roundZeroEnd,
        decisionDeadlineAtMs: at('20:02:10.000'),
      },
    });
  });

  it('decides locally the moment the round ends, even while the server still says speaking', () => {
    const gap = openRoundGapAfterTurn(listening(), 1, roundZeroEnd, at('20:02:00.001'));
    expect(gap).toMatchObject({ kind: 'hold', phase: { phase: 'deciding', roundIndex: 0 } });
  });

  it('never falls through to thanking while a decision is pending, however late', () => {
    const gap = openRoundGapAfterTurn(deciding(), 1, roundZeroEnd, at('20:05:00.000'));
    expect(gap).toMatchObject({ kind: 'hold', phase: { phase: 'deciding' } });
  });

  it('8.3 / 8.4 picks do not change the timing: still deciding until resolved', () => {
    for (const debate of [
      deciding({ my_pick: 'extend', opponent_has_picked: false }),
      deciding({ my_pick: null, opponent_has_picked: true }),
      deciding({ my_pick: 'extend', opponent_has_picked: true }),
    ]) {
      expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:03.000'))).toMatchObject({
        kind: 'hold',
        phase: { phase: 'deciding' },
      });
    }
  });

  it('8.5 reveal → extend: result window, then the next round at resolved + 3 s', () => {
    const debate = revealRebut();
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:04.250'))).toEqual({
      kind: 'hold',
      phase: {
        phase: 'result',
        roundIndex: 0,
        isFinalRound: false,
        outcome: 'extend',
        resolvedAtMs: at('20:02:04.200'),
        nextPhaseStartsAtMs: at('20:02:07.200'),
      },
    });
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:07.200'))).toEqual({
      kind: 'continue',
      nextTurnStartsAtMs: at('20:02:07.200'),
    });
  });

  it('8.6 reveal → end: result window, then thanking at resolved + 3 s', () => {
    const debate = revealEnd();
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:06.000'))).toMatchObject({
      kind: 'hold',
      phase: { phase: 'result', outcome: 'end', nextPhaseStartsAtMs: at('20:02:08.000') },
    });
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:08.000'))).toEqual({
      kind: 'thanking',
      startsAtMs: at('20:02:08.000'),
    });
  });

  it('8.7 timed out: the reveal runs from the late resolution, not the deadline', () => {
    const debate = timedOut();
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:12.000'))).toMatchObject({
      kind: 'hold',
      phase: { phase: 'result', outcome: 'end', resolvedAtMs: at('20:02:11.300') },
    });
    expect(openRoundGapAfterTurn(debate, 1, roundZeroEnd, at('20:02:14.300'))).toEqual({
      kind: 'thanking',
      startsAtMs: at('20:02:14.300'),
    });
  });

  it('a resolution seen before its moment is still deciding until then', () => {
    expect(openRoundGapAfterTurn(revealRebut(), 1, roundZeroEnd, at('20:02:04.000'))).toMatchObject({
      kind: 'hold',
      phase: { phase: 'deciding' },
    });
  });

  it('holds on an Extend whose next round has not been appended rather than inventing turns', () => {
    const { open_rounds: openRounds, ...rest } = revealRebut();
    const stale: Debate = { ...rest, turn_durations_ms: [60_000, 60_000], open_rounds: openRounds };
    expect(openRoundGapAfterTurn(stale, 1, roundZeroEnd, at('20:02:30.000'))).toMatchObject({
      kind: 'hold',
      phase: { phase: 'result', outcome: 'extend' },
    });
  });

  it('8.8 the cap round goes straight on to thanking, with no decision', () => {
    expect(openRoundGapAfterTurn(capRoundLastTurn(), 21, CAP_ROUND_ENDS_AT, CAP_ROUND_ENDS_AT + 1)).toEqual({
      kind: 'continue',
      nextTurnStartsAtMs: CAP_ROUND_ENDS_AT,
    });
  });
});

describe('open rounds: when thanking starts (the recorder’s end)', () => {
  const start = at('20:00:00.000');

  it('is undecided while any round is pending', () => {
    expect(debateThankingStartsAtMs(listening(), start, naturalTurnEnd)).toBeNull();
    expect(debateThankingStartsAtMs(deciding(), start, naturalTurnEnd)).toBeNull();
    // Round 0 resolved Extend, so round 1 is pending now.
    expect(debateThankingStartsAtMs(revealRebut(), start, naturalTurnEnd)).toBeNull();
    expect(debateThankingStartsAtMs(roundOneSpeaking(), start, naturalTurnEnd)).toBeNull();
  });

  it('is the end of the result window once a round resolves End', () => {
    expect(debateThankingStartsAtMs(revealEnd(), start, naturalTurnEnd)).toBe(at('20:02:08.000'));
    expect(debateThankingStartsAtMs(timedOut(), start, naturalTurnEnd)).toBe(at('20:02:14.300'));
  });

  it('is the cap round’s end, through every gap before it', () => {
    const cap = capRoundLastTurn();
    expect(CAP_ROUND_ENDS_AT).toBe(Date.parse(cap.turn_ends_at!));
    expect(debateThankingStartsAtMs(cap, start, naturalTurnEnd)).toBe(CAP_ROUND_ENDS_AT);
  });
});

describe('openRoundsRoomPhase', () => {
  it('reads speaking from the running turn', () => {
    expect(openRoundsRoomPhase(listening(), { effectiveStatus: 'in_progress', turnIndex: 1 })).toEqual({
      phase: 'speaking',
      roundIndex: 0,
      isFinalRound: false,
    });
    expect(openRoundsRoomPhase(capRoundLastTurn(), { effectiveStatus: 'in_progress', turnIndex: 21 })).toEqual({
      phase: 'speaking',
      roundIndex: 10,
      isFinalRound: true,
    });
  });

  it('is round 0 speaking before the opening', () => {
    expect(openRoundsRoomPhase(listening(), { effectiveStatus: 'preflight', turnIndex: null })).toMatchObject({
      phase: 'speaking',
      roundIndex: 0,
    });
  });

  it('passes a hold straight through', () => {
    const gap = openRoundGapAfterTurn(deciding(), 1, at('20:02:00.000'), at('20:02:01.000'));
    expect(
      openRoundsRoomPhase(deciding(), { effectiveStatus: 'in_progress', turnIndex: 1, openRoundsGap: gap })
    ).toEqual(gap.kind === 'hold' ? gap.phase : null);
  });

  it('is finished in thanking', () => {
    expect(openRoundsRoomPhase(revealEnd(), { effectiveStatus: 'thanking', turnIndex: null })).toEqual({
      phase: 'finished',
      roundIndex: 0,
      isFinalRound: false,
    });
  });
});
