import { describe, expect, it } from 'vitest';

import { debateFormatById, debateFormats, debateTimingSummary, debateTurnRole, defaultDebateFormatId } from './formats';

describe('debate formats', () => {
  it('matches the prototype format catalog', () => {
    expect(debateFormats.map(format => [format.id, format.label, format.turnDurationsMs])).toEqual([
      ['dev-short', '7/7 4/4 3/3', [7_000, 7_000, 4_000, 4_000, 3_000, 3_000]],
      ['standard', '1/1 45/45 30/30', [60_000, 60_000, 45_000, 45_000, 30_000, 30_000]],
      ['extended-standard', '45/45 30/30', [45_000, 45_000, 30_000, 30_000]],
      ['triple-standard', '45/45 30/30 30/30', [45_000, 45_000, 30_000, 30_000, 30_000, 30_000]],
    ]);
  });

  it('matches the geo-chat catalog for the live format', () => {
    // geo-chat resolves the id independently in `DebateFormat::standard()` and writes the
    // durations onto the debate row. If the two catalogs drift, the request dialog previews turns
    // the debate will not actually run.
    expect(debateFormatById('standard')?.turnDurationsMs).toEqual([60_000, 60_000, 45_000, 45_000, 30_000, 30_000]);
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
