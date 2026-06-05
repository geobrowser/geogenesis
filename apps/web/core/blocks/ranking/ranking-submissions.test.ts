import { describe, expect, it } from 'vitest';

import {
  aggregateLeaderboard,
  emptySubmissionsBlob,
  parseSubmissionsBlob,
  upsertSubmission,
} from './ranking-submissions';

describe('parseSubmissionsBlob', () => {
  it('returns empty blob for invalid input', () => {
    expect(parseSubmissionsBlob('')).toEqual(emptySubmissionsBlob());
    expect(parseSubmissionsBlob('{bad')).toEqual(emptySubmissionsBlob());
  });
});

describe('aggregateLeaderboard', () => {
  it('merges multiple ballots with Borda scoring', () => {
    let blob = emptySubmissionsBlob();
    blob = upsertSubmission(blob, 'alice', ['b', 'c']);
    blob = upsertSubmission(blob, 'bob', ['b', 'a']);

    const board = aggregateLeaderboard(blob);
    expect(board[0]?.entityId).toBe('b');
    expect(board[0]?.score).toBe(4);
  });
});
