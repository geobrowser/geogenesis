import { describe, expect, it } from 'vitest';

import type { DebateClaimPositionSummary, DebateParticipantSummary } from '~/core/debates/api';

import { withMatchParticipants } from './use-claim-matchup';

function person(id: string): DebateParticipantSummary {
  return { user_id: id, profile_space_id: `space-${id}`, display_name: id, avatar_cid: null };
}

function side(position: boolean, overrides: Partial<DebateClaimPositionSummary> = {}): DebateClaimPositionSummary {
  return {
    position,
    position_label: position ? 'Agree' : 'Disagree',
    total_count: 0,
    available_now_count: 0,
    present_count: undefined,
    participants: [],
    ...overrides,
  };
}

/**
 * The card offers a debate and the pills show who is there to have it. Those come from two sources —
 * the account-level matches lookup and the per-claim `online_choices` row — so they can land out of
 * step, and a card offering a debate against nobody is the visible result.
 */
describe('withMatchParticipants', () => {
  it('fills an empty side from the match the offer is based on', () => {
    const positions = [side(true, { total_count: 4 }), side(false, { total_count: 1 })];
    const matchPositions = [side(false, { participants: [person('opponent')], present_count: 1 })];

    const merged = withMatchParticipants(positions, matchPositions);

    expect(merged.find(s => s.position === false)?.participants.map(p => p.user_id)).toEqual(['opponent']);
    expect(merged.find(s => s.position === false)?.present_count).toBe(1);
  });

  it('leaves the on-chain counts alone', () => {
    // The counts are what the percentage above the pills is drawn from. Taking the match's counts
    // would put two numbers that disagree on one card — which is the reason these are separate
    // sources in the first place.
    const positions = [side(false, { total_count: 1 })];
    const matchPositions = [side(false, { participants: [person('opponent')], total_count: 99 })];

    expect(withMatchParticipants(positions, matchPositions)[0]!.total_count).toBe(1);
  });

  it('does not overwrite faces the claim already has', () => {
    // `online_choices` is the live population and the match is a snapshot of it; where both answer,
    // the live one wins.
    const positions = [side(false, { participants: [person('live')] })];
    const matchPositions = [side(false, { participants: [person('stale')] })];

    expect(withMatchParticipants(positions, matchPositions)[0]!.participants.map(p => p.user_id)).toEqual(['live']);
  });

  it('is a no-op without a match', () => {
    const positions = [side(true), side(false)];
    expect(withMatchParticipants(positions, undefined)).toBe(positions);
    expect(withMatchParticipants(positions, [])).toBe(positions);
  });

  it('leaves a side the match has nobody for', () => {
    const positions = [side(true)];
    const matchPositions = [side(true, { participants: [] })];
    expect(withMatchParticipants(positions, matchPositions)[0]!.participants).toEqual([]);
  });
});
