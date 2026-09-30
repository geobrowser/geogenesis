import { describe, expect, it } from 'vitest';

import formatContract from './debate-formats.contract.json';
import { debateFormatById, debateFormats, debateTimingSummary, debateTurnRole, defaultDebateFormatId } from './formats';

describe('debate formats', () => {
  /**
   * geo-chat keeps its own copy of this catalog (`DebateFormat` in `crates/debates`) and is the
   * one that writes `turn_durations_ms` onto the debate row; this copy only previews turns in the
   * request dialog. `debate-formats.contract.json` is the shape both sides agree on (GEO-2956):
   * this test holds `formats.ts` to it, geo-chat's tests hold its constructors to its own copy,
   * and geo-chat's CI diffs that copy against this file on `master`. A change here therefore
   * fails geo-chat's CI until geo-chat ships the same change.
   */
  it('matches the catalog contract shared with geo-chat', () => {
    expect(
      debateFormats.map(format => ({ id: format.id, label: format.label, turn_durations_ms: format.turnDurationsMs }))
    ).toEqual(formatContract);
  });

  it('formats round summaries', () => {
    const format = debateFormatById('triple-standard');

    expect(format).not.toBeNull();
    expect(debateTimingSummary(format!)).toBe('45s / 45s · 30s / 30s · 30s / 30s');
  });

  it('defaults to a configured format id', () => {
    expect(debateFormatById(defaultDebateFormatId)).not.toBeNull();
  });

  it('reads a third round as the closing argument', () => {
    expect([0, 1, 2, 3, 4, 5].map(index => debateTurnRole(index, 6))).toEqual([
      'opening',
      'opening',
      'rebuttal',
      'rebuttal',
      'closing',
      'closing',
    ]);
  });

  it('keeps the two-round reading for debates recorded before the closing round', () => {
    // Old debates replay from their own `turn_durations_ms`, so a four-turn debate must still
    // label its last round a rebuttal rather than inventing a closing argument it never had.
    expect([0, 1, 2, 3].map(index => debateTurnRole(index, 4))).toEqual(['opening', 'opening', 'rebuttal', 'rebuttal']);
  });

  it('puts the rebuttal second-to-last when a format has more rounds', () => {
    expect([0, 2, 4, 6].map(index => debateTurnRole(index, 8))).toEqual(['opening', 'response', 'rebuttal', 'closing']);
  });
});
