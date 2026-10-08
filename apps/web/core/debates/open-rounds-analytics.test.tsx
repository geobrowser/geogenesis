import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from './api';
import {
  openRoundPickSetProperties,
  openRoundPickSplit,
  openRoundsCompletedProperties,
  openRoundsEndedBy,
  resolvedOpenRounds,
  useOpenRoundsOutcomeAnalytics,
} from './open-rounds-analytics';
import {
  capRoundLastTurn,
  deciding,
  listening,
  revealEnd,
  revealRebut,
  thankingAfterEnd,
  timedOut,
} from './open-rounds-fixtures';

const analytics = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => analytics);

beforeEach(() => {
  analytics.capture.mockReset();
  sessionStorage.clear();
});

function eventsNamed(name: string) {
  return analytics.capture.mock.calls.filter(([eventName]) => eventName === name).map(([, properties]) => properties);
}

describe('openRoundPickSplit', () => {
  it('sorts rounds into the four buckets', () => {
    expect(openRoundPickSplit(resolvedOpenRounds(revealRebut())[0])).toBe('both_extend');
    expect(openRoundPickSplit(resolvedOpenRounds(revealEnd())[0])).toBe('split');
    expect(openRoundPickSplit(resolvedOpenRounds(timedOut())[0])).toBe('timeout');
    expect(
      openRoundPickSplit({
        resolution: 'both_picked',
        picks: [
          { participant_slot: 1, pick: 'end' },
          { participant_slot: 2, pick: 'end' },
        ],
      })
    ).toBe('both_end');
  });
});

describe('resolvedOpenRounds', () => {
  it('reads a round in its result window before rounds[] has it', () => {
    expect(resolvedOpenRounds(revealEnd())).toEqual([
      expect.objectContaining({ roundIndex: 0, outcome: 'end', resolution: 'both_picked' }),
    ]);
  });

  it('waits for the picks before counting a resolved round', () => {
    const debate = revealEnd();
    expect(resolvedOpenRounds({ open_rounds: { ...debate.open_rounds!, revealed_picks: null } })).toEqual([]);
  });

  it('has nothing for an unresolved round or a fixed format', () => {
    expect(resolvedOpenRounds(deciding())).toEqual([]);
    expect(resolvedOpenRounds({ open_rounds: undefined })).toEqual([]);
  });
});

describe('openRoundsEndedBy', () => {
  it('says why a debate stopped', () => {
    expect(openRoundsEndedBy(thankingAfterEnd())).toBe('split');
    expect(openRoundsEndedBy(timedOut())).toBe('timeout');
    expect(openRoundsEndedBy(capRoundLastTurn())).toBe('cap');
  });

  it('cannot say while the last round is unresolved', () => {
    expect(openRoundsEndedBy(deciding())).toBeNull();
  });
});

describe('openRoundsCompletedProperties', () => {
  it('counts rebuttal rounds and the cap', () => {
    expect(openRoundsCompletedProperties(capRoundLastTurn(), 1)).toMatchObject({
      rebuttal_rounds: 10,
      ended_by: 'cap',
      max_rebuttal_rounds: 10,
      participant_slot: 1,
    });
    expect(openRoundsCompletedProperties(thankingAfterEnd(), 2)).toMatchObject({
      rebuttal_rounds: 0,
      ended_by: 'split',
    });
  });
});

describe('openRoundPickSetProperties', () => {
  it('marks a change and measures the pick against the card and the deadline', () => {
    expect(
      openRoundPickSetProperties({
        debateId: 'debate-1',
        roundIndex: 2,
        pick: 'end',
        previousPick: 'extend',
        msSinceCardOpened: 3_400.4,
        decisionDeadlineAtMs: 10_000,
        decisionWindowMs: 10_000,
        nowMs: 3_500,
        participantSlot: 2,
      })
    ).toEqual({
      debate_id: 'debate-1',
      round_index: 2,
      pick: 'end',
      is_change: true,
      previous_pick: 'extend',
      during_decision: true,
      turn_index: 5,
      ms_before_deadline: 6_500,
      ms_since_card_opened: 3_400,
      decision_window_ms: 10_000,
      participant_slot: 2,
    });
  });

  it('a first pick is not a change', () => {
    expect(
      openRoundPickSetProperties({
        debateId: 'debate-1',
        roundIndex: 0,
        pick: 'extend',
        previousPick: null,
        msSinceCardOpened: 0,
        decisionDeadlineAtMs: 0,
        decisionWindowMs: 10_000,
        nowMs: 1_000,
        participantSlot: 1,
      })
    ).toMatchObject({ is_change: false, previous_pick: null, ms_before_deadline: 0 });
  });
});

describe('useOpenRoundsOutcomeAnalytics', () => {
  it('sends each round once and the debate once, from a live room', () => {
    const { rerender } = renderHook(({ debate }: { debate: Debate }) => useOpenRoundsOutcomeAnalytics(debate, 1), {
      initialProps: { debate: deciding() },
    });
    expect(analytics.capture).not.toHaveBeenCalled();

    rerender({ debate: revealEnd() });
    rerender({ debate: thankingAfterEnd() });
    rerender({ debate: { ...thankingAfterEnd(), status: 'complete' } });

    expect(eventsNamed('debate_round_resolved')).toEqual([
      {
        debate_id: thankingAfterEnd().id,
        round_index: 0,
        outcome: 'end',
        resolution: 'both_picked',
        participant_slot: 1,
        my_pick: 'extend',
        opponent_pick: 'end',
        split: true,
        pick_split: 'split',
      },
    ]);
    expect(eventsNamed('debate_completed_rounds')).toEqual([
      {
        debate_id: thankingAfterEnd().id,
        rebuttal_rounds: 0,
        ended_by: 'split',
        max_rebuttal_rounds: thankingAfterEnd().open_rounds!.max_rebuttal_rounds,
        participant_slot: 1,
      },
    ]);
  });

  it('does not send again after a reload in the same tab', () => {
    renderHook(() => useOpenRoundsOutcomeAnalytics(revealEnd(), 1)).unmount();
    renderHook(() => useOpenRoundsOutcomeAnalytics(revealEnd(), 1));
    expect(eventsNamed('debate_round_resolved')).toHaveLength(1);
  });

  it('sends nothing for a debate that had already ended, a spectator or a fixed format', () => {
    renderHook(() => useOpenRoundsOutcomeAnalytics({ ...thankingAfterEnd(), status: 'complete' }, 1));
    renderHook(() => useOpenRoundsOutcomeAnalytics(revealEnd(), null));
    renderHook(() => useOpenRoundsOutcomeAnalytics({ ...listening(), open_rounds: undefined }, 1));
    expect(analytics.capture).not.toHaveBeenCalled();
  });

  it('keeps the room going when analytics throws', () => {
    analytics.capture.mockImplementation(() => {
      throw new Error('analytics down');
    });
    expect(() => renderHook(() => useOpenRoundsOutcomeAnalytics(revealEnd(), 1))).not.toThrow();
  });
});
