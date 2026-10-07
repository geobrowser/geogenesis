import { describe, expect, it } from 'vitest';

import type { Debate, ParticipantSlot } from '~/core/debates/api';
import { debateTurnRole } from '~/core/debates/formats';
import { openRoundsRoomPhase } from '~/core/debates/open-rounds';
import {
  CAP_ROUND_ENDS_AT,
  at,
  capRoundLastTurn,
  deciding,
  listening,
  revealEnd,
  revealRebut,
  roundOneSpeaking,
  thankingAfterEnd,
  timedOut,
} from '~/core/debates/open-rounds-fixtures';

import {
  type DebateCountdown,
  countdownWindowForDebate,
  debateEndsSoonIsVisible,
  localTurnStartsInSeconds,
  recordingWindowForDebate,
  upcomingTurnLabel,
} from './debate-room-page-client';

/**
 * GEO-3175: the room's clock and recorder for Open rounds, and proof that fixed formats are
 * untouched.
 *
 * The proof is an oracle: the functions below are master's implementation as of 4ae1ccacc, copied
 * verbatim apart from their names. Every fixed-format debate here is walked on a 250 ms grid, with
 * and without yields, and the room's answers must equal master's at every step.
 */

function countdownAt(debate: Debate, now: number): DebateCountdown {
  // The same arithmetic as `useDebateCountdown`, without React.
  const window = countdownWindowForDebate(debate, now);
  const targetMs = window.targetMs;
  const startMs = window.startMs;
  const remainingMs = targetMs === null ? 0 : Math.max(0, targetMs - now);
  const totalMs = targetMs !== null && startMs !== null ? Math.max(1, targetMs - startMs) : 0;
  const elapsedMs = totalMs && startMs !== null ? Math.min(totalMs, Math.max(0, now - startMs)) : 0;
  return {
    label: '',
    remainingSeconds: Math.ceil(remainingMs / 1_000),
    progress: totalMs === 0 ? 0 : elapsedMs / totalMs,
    activeSlot: window.activeSlot,
    effectiveStatus: window.effectiveStatus,
    turnIndex: window.turnIndex,
    elapsedMs,
    yieldingSlot: window.yieldingSlot,
    incomingSlot: window.incomingSlot,
    yieldedRemainingSeconds: window.yieldedRemainingSeconds,
    yieldedProgress: window.yieldedProgress,
    preservesExistingCountIn: window.preservesExistingCountIn,
    openRounds: openRoundsRoomPhase(debate, window),
  };
}

// --- master's implementation (4ae1ccacc), the oracle for fixed formats -------------------------

function timestampMs(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function legacyUpcomingTurnLabel(debate: Debate, countdown: DebateCountdown) {
  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return null;
  const nextTurnIndex = countdown.turnIndex + 1;
  const turnCount = debate.turn_durations_ms.length;
  if (nextTurnIndex >= turnCount) return null;
  switch (debateTurnRole(nextTurnIndex, turnCount)) {
    case 'rebuttal':
      return 'Rebut in';
    case 'closing':
      return 'Closing argument in';
    default:
      return null;
  }
}

function legacyDebateEndsSoonIsVisible(debate: Debate, countdown: DebateCountdown, localSlot: ParticipantSlot | null) {
  if (!localSlot || countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return false;
  if (countdown.activeSlot === localSlot) return false;
  if (countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return false;
  return countdown.turnIndex === debate.turn_durations_ms.length - 1;
}
function legacyLocalTurnStartsInSeconds(
  debate: Debate,
  countdown: DebateCountdown,
  localSlot: ParticipantSlot | null
): number | null {
  if (!localSlot || countdown.remainingSeconds <= 0 || countdown.remainingSeconds > 5) return null;

  if (countdown.effectiveStatus === 'preflight') {
    return countdown.activeSlot === localSlot ? countdown.remainingSeconds : null;
  }

  if (countdown.effectiveStatus !== 'in_progress' || countdown.turnIndex === null) return null;
  if (countdown.yieldingSlot !== null) {
    return countdown.incomingSlot === localSlot ? countdown.remainingSeconds : null;
  }
  if (countdown.activeSlot === localSlot) return null;

  const nextTurnIndex = countdown.turnIndex + 1;
  if (nextTurnIndex >= debate.turn_durations_ms.length) return null;

  return participantSlotForTurn(debate.first_participant_slot, nextTurnIndex) === localSlot
    ? countdown.remainingSeconds
    : null;
}

function participantSlotForTurn(firstParticipantSlot: ParticipantSlot, turnIndex: number): ParticipantSlot {
  if (turnIndex % 2 === 0) return firstParticipantSlot;
  return firstParticipantSlot === 1 ? 2 : 1;
}
function legacyRecordingWindowForDebate(debate: Debate): { startAtMs: number; endAtMs: number } | null {
  const startAtMs = timestampMs(debate.started_at ?? debate.preflight_ends_at);
  if (startAtMs === null || debate.turn_durations_ms.length === 0) return null;

  let endAtMs = startAtMs;
  for (const [turnIndex, durationMs] of debate.turn_durations_ms.entries()) {
    const naturalTurnEndMs = endAtMs + Math.max(0, durationMs);
    const handoffDeadlineMs = timestampMs(
      debate.turn_yields?.find(turnYield => turnYield.turn_index === turnIndex)?.handoff_deadline_at ?? null
    );
    endAtMs = handoffDeadlineMs === null ? naturalTurnEndMs : Math.min(naturalTurnEndMs, handoffDeadlineMs);
  }

  if (endAtMs <= startAtMs) return null;

  return {
    startAtMs,
    endAtMs: endAtMs + 5_000,
  };
}

function legacyTimedDebateCountdownWindow(
  debate: Debate,
  debateStartMs: number,
  now: number
): {
  startMs: number;
  targetMs: number;
  activeSlot: ParticipantSlot | null;
  effectiveStatus: Debate['status'];
  turnIndex: number | null;
  yieldingSlot: ParticipantSlot | null;
  incomingSlot: ParticipantSlot | null;
  yieldedRemainingSeconds: number | null;
  yieldedProgress: number | null;
  preservesExistingCountIn: boolean;
} {
  let turnStartMs = debateStartMs;

  for (const [turnIndex, configuredDurationMs] of debate.turn_durations_ms.entries()) {
    const naturalTurnEndMs = turnStartMs + Math.max(0, configuredDurationMs);
    const turnYield = debate.turn_yields?.find(candidate => candidate.turn_index === turnIndex);
    const yieldedAtMs = turnYield ? timestampMs(turnYield.yielded_at) : null;
    const handoffDeadlineMs = turnYield ? timestampMs(turnYield.handoff_deadline_at) : null;
    const validYieldedAtMs =
      yieldedAtMs !== null && yieldedAtMs >= turnStartMs && yieldedAtMs <= naturalTurnEndMs ? yieldedAtMs : null;
    const validHandoffDeadlineMs =
      validYieldedAtMs !== null && handoffDeadlineMs !== null
        ? Math.max(validYieldedAtMs, Math.min(naturalTurnEndMs, handoffDeadlineMs))
        : null;

    if (
      validYieldedAtMs !== null &&
      validHandoffDeadlineMs !== null &&
      (now >= validYieldedAtMs || turnYield?.user_id === '__pending__')
    ) {
      if (now < validHandoffDeadlineMs) {
        const yieldingSlot = participantSlotForTurn(debate.first_participant_slot, turnIndex);
        return {
          startMs: validYieldedAtMs,
          targetMs: validHandoffDeadlineMs,
          activeSlot: null,
          effectiveStatus: 'in_progress',
          turnIndex,
          yieldingSlot,
          incomingSlot:
            turnIndex + 1 < debate.turn_durations_ms.length
              ? participantSlotForTurn(debate.first_participant_slot, turnIndex + 1)
              : null,
          yieldedRemainingSeconds: Math.max(0, Math.ceil((naturalTurnEndMs - validYieldedAtMs) / 1_000)),
          yieldedProgress:
            configuredDurationMs > 0
              ? Math.max(0, Math.min(1, (validYieldedAtMs - turnStartMs) / configuredDurationMs))
              : 0,
          preservesExistingCountIn: validHandoffDeadlineMs === naturalTurnEndMs,
        };
      }
      turnStartMs = validHandoffDeadlineMs;
      continue;
    }

    if (now < naturalTurnEndMs) {
      return {
        startMs: turnStartMs,
        targetMs: naturalTurnEndMs,
        activeSlot: participantSlotForTurn(debate.first_participant_slot, turnIndex),
        effectiveStatus: 'in_progress',
        turnIndex,
        yieldingSlot: null,
        incomingSlot: null,
        yieldedRemainingSeconds: null,
        yieldedProgress: null,
        preservesExistingCountIn: false,
      };
    }
    turnStartMs = validHandoffDeadlineMs ?? naturalTurnEndMs;
  }

  return {
    startMs: turnStartMs,
    targetMs: turnStartMs + 20_000,
    activeSlot: null,
    effectiveStatus: 'thanking',
    turnIndex: null,
    yieldingSlot: null,
    incomingSlot: null,
    yieldedRemainingSeconds: null,
    yieldedProgress: null,
    preservesExistingCountIn: false,
  };
}

// --- fixed formats ------------------------------------------------------------------------------

function fixedDebate(turnDurationsMs: number[], overrides: Partial<Debate> = {}): Debate {
  const { open_rounds: _openRounds, ...rest } = listening();
  return {
    ...rest,
    turn_format_id: 'standard',
    turn_durations_ms: turnDurationsMs,
    current_turn_index: 0,
    current_speaker_slot: 1,
    ...overrides,
  };
}

const start = at('20:00:00.000');
const standardTurns = [60_000, 60_000, 45_000, 45_000, 30_000, 30_000];

const fixedCases: Array<[string, Debate]> = [
  ['standard', fixedDebate(standardTurns)],
  ['dev-short', fixedDebate([7_000, 7_000, 4_000, 4_000, 3_000, 3_000])],
  ['two turns', fixedDebate([30_000, 30_000])],
  [
    'standard with a mid-debate yield',
    fixedDebate(standardTurns, {
      turn_yields: [
        {
          turn_index: 2,
          user_id: 'user-a',
          participant_slot: 1,
          yielded_at: '2026-10-06T20:02:20.000Z',
          accepted_at: '2026-10-06T20:02:20.000Z',
          handoff_deadline_at: '2026-10-06T20:02:25.000Z',
        },
      ],
    }),
  ],
  [
    'standard with the last turn yielded',
    fixedDebate(standardTurns, {
      turn_yields: [
        {
          turn_index: 5,
          user_id: 'user-b',
          participant_slot: 2,
          yielded_at: '2026-10-06T20:04:20.000Z',
          accepted_at: '2026-10-06T20:04:20.000Z',
          handoff_deadline_at: '2026-10-06T20:04:20.000Z',
        },
      ],
    }),
  ],
  [
    'standard with a yield still pending',
    fixedDebate(standardTurns, {
      turn_yields: [
        {
          turn_index: 1,
          user_id: '__pending__',
          participant_slot: 2,
          yielded_at: '2026-10-06T20:01:30.000Z',
          accepted_at: '2026-10-06T20:01:30.000Z',
          handoff_deadline_at: '2026-10-06T20:02:00.000Z',
        },
      ],
    }),
  ],
];

describe('fixed formats behave exactly as on master', () => {
  it.each(fixedCases)('%s: the clock, labels and count-ins match master on a 250 ms grid', (_name, debate) => {
    const totalMs = debate.turn_durations_ms.reduce((sum, durationMs) => sum + durationMs, 0);
    const slots: Array<ParticipantSlot | null> = [1, 2, null];
    let steps = 0;
    for (let now = start - 1_000; now <= start + totalMs + 30_000; now += 250) {
      const window = countdownWindowForDebate(debate, now);
      expect(window).toEqual(legacyTimedDebateCountdownWindow(debate, start, now));
      expect(window.openRoundsGap).toBeUndefined();

      const countdown = countdownAt(debate, now);
      expect(countdown.openRounds).toBeNull();
      expect(upcomingTurnLabel(debate, countdown)).toBe(legacyUpcomingTurnLabel(debate, countdown));
      for (const slot of slots) {
        expect(debateEndsSoonIsVisible(debate, countdown, slot)).toBe(
          legacyDebateEndsSoonIsVisible(debate, countdown, slot)
        );
        expect(localTurnStartsInSeconds(debate, countdown, slot)).toBe(
          legacyLocalTurnStartsInSeconds(debate, countdown, slot)
        );
      }
      steps += 1;
    }
    expect(steps).toBeGreaterThan(100);
  });

  it.each(fixedCases)('%s: the recording window matches master', (_name, debate) => {
    expect(recordingWindowForDebate(debate)).toEqual(legacyRecordingWindowForDebate(debate));
  });

  it('still shows "Debate ends soon" on a fixed format’s last turn', () => {
    const debate = fixedCases[0][1];
    // The last turn (slot 2) ends at 20:04:30.
    expect(debateEndsSoonIsVisible(debate, countdownAt(debate, at('20:04:27.000')), 1)).toBe(true);
  });
});

// --- open rounds: the contract's mock states -----------------------------------------------------

describe('open rounds clock', () => {
  it('8.1 listening: the opening runs as a fixed format would, with no count-in into an undecided round', () => {
    const debate = listening();
    const countdown = countdownAt(debate, at('20:01:57.000'));
    expect(countdown).toMatchObject({
      effectiveStatus: 'in_progress',
      activeSlot: 2,
      turnIndex: 1,
      remainingSeconds: 3,
      openRounds: { phase: 'speaking', roundIndex: 0, isFinalRound: false },
    });
    // Alice opens every round, but round 1 has not been decided, so nothing counts her in...
    expect(localTurnStartsInSeconds(debate, countdown, 1)).toBeNull();
    expect(upcomingTurnLabel(debate, countdown)).toBeNull();
    // ...and the opening is not the end of the debate.
    expect(debateEndsSoonIsVisible(debate, countdown, 1)).toBe(false);
  });

  it('8.1 → 8.2: enters deciding the moment the round ends, before the server says so', () => {
    const debate = listening();
    const countdown = countdownAt(debate, at('20:02:00.500'));
    expect(countdown).toMatchObject({
      effectiveStatus: 'in_progress',
      activeSlot: null,
      turnIndex: 1,
      remainingSeconds: 10,
      openRounds: {
        phase: 'deciding',
        roundIndex: 0,
        roundEndedAtMs: at('20:02:00.000'),
        decisionDeadlineAtMs: at('20:02:10.000'),
      },
    });
  });

  it('8.2 – 8.4 deciding: counts down the decision window whatever has been picked', () => {
    for (const debate of [
      deciding(),
      deciding({ my_pick: 'extend', opponent_has_picked: false }),
      deciding({ my_pick: null, opponent_has_picked: true }),
      deciding({ my_pick: 'end', opponent_has_picked: true }),
    ]) {
      const countdown = countdownAt(debate, at('20:02:04.000'));
      expect(countdown).toMatchObject({ remainingSeconds: 6, openRounds: { phase: 'deciding', roundIndex: 0 } });
      expect(countdown.progress).toBeCloseTo(0.4);
      for (const slot of [1, 2] as const) {
        expect(localTurnStartsInSeconds(debate, countdown, slot)).toBeNull();
        expect(debateEndsSoonIsVisible(debate, countdown, slot)).toBe(false);
      }
      expect(upcomingTurnLabel(debate, countdown)).toBeNull();
    }
  });

  it('never falls through to thanking while a decision is pending past its deadline', () => {
    const debate = deciding();
    for (const time of ['20:02:10.000', '20:02:12.000', '20:03:00.000']) {
      const countdown = countdownAt(debate, at(time));
      expect(countdown.effectiveStatus).toBe('in_progress');
      expect(countdown.openRounds).toMatchObject({ phase: 'deciding' });
      expect(countdown.remainingSeconds).toBe(0);
    }
    expect(recordingWindowForDebate(debate)).toEqual({ startAtMs: start, endAtMs: null });
  });

  it('8.5 reveal → Extend: a 3 s result window that counts Alice into round 1, then round 1', () => {
    const debate = revealRebut();
    const reveal = countdownAt(debate, at('20:02:05.000'));
    expect(reveal).toMatchObject({
      effectiveStatus: 'in_progress',
      activeSlot: null,
      turnIndex: 1,
      remainingSeconds: 3,
      openRounds: { phase: 'result', roundIndex: 0, outcome: 'extend', nextPhaseStartsAtMs: at('20:02:07.200') },
    });
    // Round 1 is decided now, so the opener is counted in and the label names it.
    expect(localTurnStartsInSeconds(debate, reveal, 1)).toBe(3);
    expect(localTurnStartsInSeconds(debate, reveal, 2)).toBeNull();
    expect(upcomingTurnLabel(debate, reveal)).toBe('Rebut in');

    const roundOne = countdownAt(debate, at('20:02:07.200'));
    expect(roundOne).toMatchObject({
      effectiveStatus: 'in_progress',
      activeSlot: 1,
      turnIndex: 2,
      remainingSeconds: 45,
      openRounds: { phase: 'speaking', roundIndex: 1 },
    });
    expect(countdownWindowForDebate(debate, at('20:02:07.200'))).toMatchObject({
      startMs: at('20:02:07.200'),
      targetMs: at('20:02:52.200'),
    });
  });

  it('round 1: Bob is counted in after Alice, but nobody is counted into round 2 yet', () => {
    const debate = roundOneSpeaking();
    const aliceEnding = countdownAt(debate, at('20:02:49.000'));
    expect(aliceEnding).toMatchObject({ activeSlot: 1, turnIndex: 2 });
    expect(localTurnStartsInSeconds(debate, aliceEnding, 2)).toBe(4);
    expect(upcomingTurnLabel(debate, aliceEnding)).toBe('Rebut in');

    const bobEnding = countdownAt(debate, at('20:03:34.000'));
    expect(bobEnding).toMatchObject({ activeSlot: 2, turnIndex: 3 });
    expect(localTurnStartsInSeconds(debate, bobEnding, 1)).toBeNull();
    expect(upcomingTurnLabel(debate, bobEnding)).toBeNull();
    expect(debateEndsSoonIsVisible(debate, bobEnding, 1)).toBe(false);

    expect(countdownAt(debate, at('20:03:37.200')).openRounds).toMatchObject({ phase: 'deciding', roundIndex: 1 });
  });

  it('8.6 reveal → End: the result window, then thanking from resolved + 3 s', () => {
    const debate = revealEnd();
    const reveal = countdownAt(debate, at('20:02:06.000'));
    expect(reveal).toMatchObject({
      effectiveStatus: 'in_progress',
      remainingSeconds: 2,
      openRounds: { phase: 'result', outcome: 'end' },
    });
    expect(localTurnStartsInSeconds(debate, reveal, 1)).toBeNull();
    expect(upcomingTurnLabel(debate, reveal)).toBeNull();

    const thanking = countdownAt(debate, at('20:02:08.000'));
    expect(thanking).toMatchObject({ effectiveStatus: 'thanking', openRounds: { phase: 'finished', roundIndex: 0 } });
    expect(countdownWindowForDebate(debate, at('20:02:08.000'))).toMatchObject({ startMs: at('20:02:08.000') });

    // And once the sweep has written it, back-dated.
    expect(countdownAt(thankingAfterEnd(), at('20:02:09.000'))).toMatchObject({
      effectiveStatus: 'thanking',
      openRounds: { phase: 'finished' },
    });
  });

  it('8.7 timed out: the reveal runs from the late resolution', () => {
    const debate = timedOut();
    expect(countdownAt(debate, at('20:02:11.000')).openRounds).toMatchObject({ phase: 'deciding' });
    expect(countdownAt(debate, at('20:02:12.000'))).toMatchObject({
      remainingSeconds: 3,
      openRounds: { phase: 'result', outcome: 'end', resolvedAtMs: at('20:02:11.300') },
    });
    expect(countdownAt(debate, at('20:02:14.300')).effectiveStatus).toBe('thanking');
  });

  it('8.8 cap: "Debate ends soon" on the cap round’s last turn only, then straight to thanking', () => {
    const debate = capRoundLastTurn();
    const capEnding = countdownAt(debate, CAP_ROUND_ENDS_AT - 3_000);
    expect(capEnding).toMatchObject({
      activeSlot: 2,
      turnIndex: 21,
      openRounds: { phase: 'speaking', roundIndex: 10, isFinalRound: true },
    });
    expect(debateEndsSoonIsVisible(debate, capEnding, 1)).toBe(true);
    expect(localTurnStartsInSeconds(debate, capEnding, 1)).toBeNull();

    // Round 9's last turn is not the end, although every turn is already in the list.
    const roundNineEndsAt = CAP_ROUND_ENDS_AT - 95_000;
    const roundNineEnding = countdownAt(debate, roundNineEndsAt - 3_000);
    expect(roundNineEnding).toMatchObject({ activeSlot: 2, turnIndex: 19 });
    expect(debateEndsSoonIsVisible(debate, roundNineEnding, 1)).toBe(false);

    expect(countdownAt(debate, CAP_ROUND_ENDS_AT + 1)).toMatchObject({
      effectiveStatus: 'thanking',
      openRounds: { phase: 'finished', roundIndex: 10, isFinalRound: true },
    });
  });

  it('reload during a decision comes back to the same phase and countdown', () => {
    // The room keeps no timing state of its own: a reloaded page re-reads the row and the server
    // clock, so the same row at the same instant must give the same countdown.
    const now = at('20:02:06.400');
    const before = countdownAt(deciding({ my_pick: 'extend', opponent_has_picked: true }), now);
    const reloadedRow = JSON.parse(JSON.stringify(deciding({ my_pick: 'extend', opponent_has_picked: true })));
    const after = countdownAt(reloadedRow, now);
    expect(after).toEqual(before);
    expect(after).toMatchObject({ remainingSeconds: 4, openRounds: { phase: 'deciding', roundIndex: 0 } });

    // A reload during the reveal, after round 1 was appended, too.
    const reveal = JSON.parse(JSON.stringify(revealRebut()));
    expect(countdownAt(reveal, at('20:02:06.000'))).toEqual(countdownAt(revealRebut(), at('20:02:06.000')));
  });
});

describe('open rounds recording window', () => {
  it('has no end while the debate can still run on', () => {
    for (const debate of [listening(), deciding(), revealRebut(), roundOneSpeaking()]) {
      expect(recordingWindowForDebate(debate)).toEqual({ startAtMs: start, endAtMs: null });
    }
  });

  it('ends a post-roll after thanking starts once a round resolves End', () => {
    expect(recordingWindowForDebate(revealEnd())).toEqual({ startAtMs: start, endAtMs: at('20:02:13.000') });
    expect(recordingWindowForDebate(thankingAfterEnd())).toEqual({ startAtMs: start, endAtMs: at('20:02:13.000') });
    expect(recordingWindowForDebate(timedOut())).toEqual({ startAtMs: start, endAtMs: at('20:02:19.300') });
  });

  it('covers every round up to the cap, then the same post-roll', () => {
    expect(recordingWindowForDebate(capRoundLastTurn())).toEqual({
      startAtMs: start,
      endAtMs: CAP_ROUND_ENDS_AT + 5_000,
    });
  });
});
