import { describe, expect, it } from 'vitest';

import { debateFormatById, debateFormats, debateTimingSummary, defaultDebateFormatId } from './formats';

describe('debate formats', () => {
  it('matches the prototype format catalog', () => {
    expect(debateFormats.map(format => [format.id, format.label, format.turnDurationsMs])).toEqual([
      ['standard', '30/30 20/20', [30_000, 30_000, 20_000, 20_000]],
      ['extended-open', '45/45 20/20', [45_000, 45_000, 20_000, 20_000]],
      ['extended-standard', '45/45 30/30', [45_000, 45_000, 30_000, 30_000]],
      ['minute-double', '1/1 1/1 20/20', [60_000, 60_000, 60_000, 60_000, 20_000, 20_000]],
      ['triple-standard', '30/30 30/30 30/30 20/20', [30_000, 30_000, 30_000, 30_000, 30_000, 30_000, 20_000, 20_000]],
      ['dev-short', '5/5 2/2', [5_000, 5_000, 2_000, 2_000]],
    ]);
  });

  it('formats round summaries', () => {
    const format = debateFormatById('minute-double');

    expect(format).not.toBeNull();
    expect(debateTimingSummary(format!)).toBe('1m / 1m · 1m / 1m · 20s / 20s');
  });

  it('defaults to a configured format id', () => {
    expect(debateFormatById(defaultDebateFormatId)).not.toBeNull();
  });
});
