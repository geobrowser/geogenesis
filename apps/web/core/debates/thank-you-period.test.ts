import { describe, expect, it } from 'vitest';

import { debateThankYouDeadlineMs, isDebateInThankYouPeriod } from './thank-you-period';

describe('isDebateInThankYouPeriod', () => {
  const deadline = Date.parse('2026-07-02T00:01:30.000Z');

  it('keeps an early-completed debate in thanking until its authoritative deadline', () => {
    expect(
      isDebateInThankYouPeriod(
        {
          status: 'complete',
          turn_ends_at: '2026-07-02T00:01:30.000Z',
          completed_at: '2026-07-02T00:01:10.000Z',
        },
        deadline - 1
      )
    ).toBe(true);
  });

  it('ends thanking exactly at the authoritative deadline', () => {
    expect(
      isDebateInThankYouPeriod(
        {
          status: 'thanking',
          turn_ends_at: '2026-07-02T00:01:30.000Z',
          completed_at: null,
        },
        deadline
      )
    ).toBe(false);
  });
});

describe('debateThankYouDeadlineMs', () => {
  it('has no deadline before the debate has ended', () => {
    expect(
      debateThankYouDeadlineMs({ status: 'in_progress', turn_ends_at: '2026-07-02T00:01:30.000Z', completed_at: null })
    ).toBeNull();
  });

  it('falls back to completed_at when the thank-you period never ran', () => {
    expect(
      debateThankYouDeadlineMs({ status: 'complete', turn_ends_at: null, completed_at: '2026-07-02T00:01:10.000Z' })
    ).toBe(Date.parse('2026-07-02T00:01:10.000Z'));
  });
});
