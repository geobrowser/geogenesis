import { describe, expect, it } from 'vitest';

import { debateFormatById, debateFormats, debateTimingSummary, defaultDebateFormatId } from './formats';

describe('debate formats', () => {
  it('matches the prototype format catalog', () => {
    expect(debateFormats.map(format => [format.id, format.label, format.turnDurationsMs])).toEqual([
      ['dev-short', '7/7 4/4', [7_000, 7_000, 4_000, 4_000]],
      ['standard', '1/1 45/45', [60_000, 60_000, 45_000, 45_000]],
      ['extended-standard', '45/45 30/30', [45_000, 45_000, 30_000, 30_000]],
      ['triple-standard', '45/45 30/30 30/30', [45_000, 45_000, 30_000, 30_000, 30_000, 30_000]],
    ]);
  });

  it('formats round summaries', () => {
    const format = debateFormatById('triple-standard');

    expect(format).not.toBeNull();
    expect(debateTimingSummary(format!)).toBe('45s / 45s · 30s / 30s · 30s / 30s');
  });

  it('defaults to a configured format id', () => {
    expect(debateFormatById(defaultDebateFormatId)).not.toBeNull();
  });
});
