import type { Debate, DebateOpenRounds, OpenRoundHistoryEntry } from './api';

/**
 * The mock states of geo-chat `docs/open-rounds-contract.md` §8, as whole Debate payloads, for
 * tests. Alice is slot 1 and opens; Bob is slot 2. The opening runs 20:00:00–20:02:00 UTC.
 */

export const OPENING_STARTED_AT = '2026-10-06T20:00:00.000Z';

export const at = (time: string) => Date.parse(`2026-10-06T${time}Z`);

const iso = (ms: number) => new Date(ms).toISOString();

function baseDebate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'debate-claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'in_progress',
    response_kind: null,
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: 1,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: OPENING_STARTED_AT,
    turn_ends_at: '2026-10-06T20:01:00.000Z',
    preflight_ends_at: OPENING_STARTED_AT,
    turn_format_id: 'open_rounds',
    turn_durations_ms: [60_000, 60_000],
    created_at: '2026-10-06T19:59:00.000Z',
    started_at: OPENING_STARTED_AT,
    completed_at: null,
    participants: [
      {
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alice',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: '2026-10-06T19:59:30.000Z',
        ready_at: '2026-10-06T19:59:30.000Z',
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bob',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: '2026-10-06T19:59:30.000Z',
        ready_at: '2026-10-06T19:59:30.000Z',
      },
    ],
    recordings: [],
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}

function block(overrides: Partial<DebateOpenRounds> = {}): DebateOpenRounds {
  return {
    as_of: '2026-10-06T20:01:30.000Z',
    max_rebuttal_rounds: 10,
    rebuttal_turn_ms: 45_000,
    decision_window_ms: 10_000,
    result_window_ms: 3_000,
    round_index: 0,
    phase: 'speaking',
    is_final_round: false,
    can_pick: true,
    round_ends_at: '2026-10-06T20:02:00.000Z',
    decision_deadline_at: '2026-10-06T20:02:10.000Z',
    decision_resolved_at: null,
    next_phase_starts_at: null,
    my_pick: null,
    opponent_has_picked: false,
    outcome: null,
    resolution: null,
    revealed_picks: null,
    turn_roles: ['opening', 'opening'],
    rounds: [],
    ...overrides,
  };
}

/** 8.1: the opening, Bob speaking, Alice's view. */
export function listening(): Debate {
  return {
    ...baseDebate(),
    current_turn_index: 1,
    current_speaker_slot: 2,
    turn_started_at: '2026-10-06T20:01:00.000Z',
    turn_ends_at: '2026-10-06T20:02:00.000Z',
    open_rounds: block(),
  };
}

/** 8.2: deciding, neither picked. 8.3 and 8.4 differ only in `my_pick` / `opponent_has_picked`. */
export function deciding(overrides: Partial<DebateOpenRounds> = {}): Debate {
  return {
    ...listening(),
    current_speaker_slot: null,
    open_rounds: block({ as_of: '2026-10-06T20:02:01.000Z', phase: 'deciding', ...overrides }),
  };
}

const roundZeroRebut: OpenRoundHistoryEntry = {
  round_index: 0,
  ended_at: '2026-10-06T20:02:00.000Z',
  decision_deadline_at: '2026-10-06T20:02:10.000Z',
  decision_resolved_at: '2026-10-06T20:02:04.200Z',
  outcome: 'extend',
  resolution: 'both_picked',
  picks: [
    { participant_slot: 1, pick: 'extend' },
    { participant_slot: 2, pick: 'extend' },
  ],
};

/** 8.5: the reveal of an Extend. The next round is already appended and starts at 20:02:07.2. */
export function revealRebut(): Debate {
  return {
    ...baseDebate(),
    turn_durations_ms: [60_000, 60_000, 45_000, 45_000],
    current_turn_index: 2,
    current_speaker_slot: 1,
    turn_started_at: '2026-10-06T20:02:07.200Z',
    turn_ends_at: '2026-10-06T20:02:52.200Z',
    open_rounds: block({
      as_of: '2026-10-06T20:02:04.250Z',
      phase: 'result',
      can_pick: false,
      decision_resolved_at: '2026-10-06T20:02:04.200Z',
      next_phase_starts_at: '2026-10-06T20:02:07.200Z',
      my_pick: 'extend',
      opponent_has_picked: true,
      outcome: 'extend',
      resolution: 'both_picked',
      revealed_picks: roundZeroRebut.picks,
      turn_roles: ['opening', 'opening', 'rebuttal', 'rebuttal'],
      rounds: [roundZeroRebut],
    }),
  };
}

/** What a fetch after 20:02:07.2 returns: round 1 speaking, Alice first. */
export function roundOneSpeaking(): Debate {
  const debate = revealRebut();
  return {
    ...debate,
    open_rounds: block({
      as_of: '2026-10-06T20:02:30.000Z',
      round_index: 1,
      phase: 'speaking',
      round_ends_at: '2026-10-06T20:03:37.200Z',
      decision_deadline_at: '2026-10-06T20:03:47.200Z',
      turn_roles: ['opening', 'opening', 'rebuttal', 'rebuttal'],
      rounds: [roundZeroRebut],
    }),
  };
}

/** 8.6: the reveal of a split (Alice Extend, Bob End). Thanking starts at 20:02:08. */
export function revealEnd(): Debate {
  return {
    ...deciding(),
    open_rounds: block({
      as_of: '2026-10-06T20:02:05.050Z',
      phase: 'result',
      can_pick: false,
      decision_resolved_at: '2026-10-06T20:02:05.000Z',
      next_phase_starts_at: '2026-10-06T20:02:08.000Z',
      my_pick: 'extend',
      opponent_has_picked: true,
      outcome: 'end',
      resolution: 'both_picked',
      revealed_picks: [
        { participant_slot: 1, pick: 'extend' },
        { participant_slot: 2, pick: 'end' },
      ],
    }),
  };
}

/** 8.6, once the sweep has written thanking (back-dated to 20:02:08). */
export function thankingAfterEnd(): Debate {
  const revealed = revealEnd();
  return {
    ...revealed,
    status: 'thanking',
    current_speaker_slot: null,
    turn_started_at: '2026-10-06T20:02:08.000Z',
    turn_ends_at: '2026-10-06T20:03:08.000Z',
    open_rounds: {
      ...revealed.open_rounds!,
      phase: 'finished',
      rounds: [
        {
          round_index: 0,
          ended_at: '2026-10-06T20:02:00.000Z',
          decision_deadline_at: '2026-10-06T20:02:10.000Z',
          decision_resolved_at: '2026-10-06T20:02:05.000Z',
          outcome: 'end',
          resolution: 'both_picked',
          picks: revealed.open_rounds!.revealed_picks!,
        },
      ],
    },
  };
}

/** 8.7: timed out (Alice Extend, Bob never picked), resolved by the sweep at 20:02:11.3. */
export function timedOut(): Debate {
  return {
    ...deciding(),
    open_rounds: block({
      as_of: '2026-10-06T20:02:11.350Z',
      phase: 'result',
      can_pick: false,
      decision_resolved_at: '2026-10-06T20:02:11.300Z',
      next_phase_starts_at: '2026-10-06T20:02:14.300Z',
      my_pick: 'extend',
      opponent_has_picked: false,
      outcome: 'end',
      resolution: 'deadline',
      revealed_picks: [
        { participant_slot: 1, pick: 'extend' },
        { participant_slot: 2, pick: null },
      ],
    }),
  };
}

/**
 * 8.8: the cap round (round 10), Bob speaking its last turn. Every earlier round resolved Extend
 * 2 s after it ended, so each rebuttal round runs 45 + 45 s after a 5 s gap (2 s deciding, 3 s
 * reveal) — round `r ≥ 1` starts at 20:02:05 + (r − 1) × 95 s.
 */
export function capRoundLastTurn(): Debate {
  const rounds: OpenRoundHistoryEntry[] = [];
  let roundEndMs = at('20:02:00.000');
  for (let roundIndex = 0; roundIndex < 10; roundIndex += 1) {
    const resolvedAtMs = roundEndMs + 2_000;
    rounds.push({
      round_index: roundIndex,
      ended_at: iso(roundEndMs),
      decision_deadline_at: iso(roundEndMs + 10_000),
      decision_resolved_at: iso(resolvedAtMs),
      outcome: 'extend',
      resolution: 'both_picked',
      picks: [
        { participant_slot: 1, pick: 'extend' },
        { participant_slot: 2, pick: 'extend' },
      ],
    });
    roundEndMs = resolvedAtMs + 3_000 + 90_000;
  }
  const finalRoundEndsAtMs = roundEndMs;
  return {
    ...baseDebate(),
    turn_durations_ms: [60_000, 60_000, ...Array.from({ length: 20 }, () => 45_000)],
    current_turn_index: 21,
    current_speaker_slot: 2,
    turn_started_at: iso(finalRoundEndsAtMs - 45_000),
    turn_ends_at: iso(finalRoundEndsAtMs),
    open_rounds: block({
      as_of: iso(finalRoundEndsAtMs - 20_000),
      round_index: 10,
      phase: 'speaking',
      is_final_round: true,
      can_pick: false,
      round_ends_at: iso(finalRoundEndsAtMs),
      decision_deadline_at: null,
      turn_roles: ['opening', 'opening', ...Array.from({ length: 20 }, () => 'rebuttal' as const)],
      rounds,
    }),
  };
}

/** When the cap round of `capRoundLastTurn` ends: 20:02:05 + 9 × 95 s + 90 s = 20:17:50. */
export const CAP_ROUND_ENDS_AT = at('20:17:50.000');
