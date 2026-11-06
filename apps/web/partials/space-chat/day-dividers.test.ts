import { describe, expect, it } from 'vitest';

import { dayBreaks, dayLabel } from './day-dividers';
import type { ChatViewMessage } from './types';

// Local-time dates, so the labels hold in any test timezone.
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();
const NOW = new Date(2026, 10, 4, 15, 0);

const message = (id: string, createdAt: string, pending = false): ChatViewMessage => ({
  id,
  author: { id: 'a', name: 'A', avatarUrl: null, avatarSeed: 'a' },
  body: id,
  createdAt,
  editedAt: null,
  deleted: false,
  pending,
});

describe('dayLabel', () => {
  it('names today and yesterday by local day, not by 24 hours', () => {
    expect(dayLabel(at(2026, 11, 4, 0, 1), NOW)).toBe('Today');
    expect(dayLabel(at(2026, 11, 3, 23, 59), NOW)).toBe('Yesterday');
    expect(dayLabel(at(2026, 11, 3, 0, 0), NOW)).toBe('Yesterday');
  });

  it('spells older days in the current year without the year', () => {
    expect(dayLabel(at(2026, 10, 14), NOW)).toBe('Wednesday 14 Oct');
  });

  it('adds the year outside the current one', () => {
    expect(dayLabel(at(2025, 10, 14), NOW)).toBe('Tuesday 14 Oct 2025');
  });

  it('treats the day before 1 January as Yesterday', () => {
    expect(dayLabel(at(2025, 12, 31), new Date(2026, 0, 1, 9))).toBe('Yesterday');
  });

  it('is empty for an unreadable time', () => {
    expect(dayLabel('not a date', NOW)).toBe('');
  });
});

describe('dayBreaks', () => {
  it('puts a divider before the first message and at each change of day', () => {
    const breaks = dayBreaks(
      [
        message('1', at(2026, 10, 14, 9)),
        message('2', at(2026, 10, 14, 18)),
        message('3', at(2026, 11, 3, 8)),
        message('4', at(2026, 11, 4, 8)),
        message('5', at(2026, 11, 4, 9)),
      ],
      NOW
    );
    expect([...breaks]).toEqual([
      [0, 'Wednesday 14 Oct'],
      [2, 'Yesterday'],
      [3, 'Today'],
    ]);
  });

  it('gives a short history its day', () => {
    expect([...dayBreaks([message('1', at(2026, 11, 4, 9))], NOW)]).toEqual([[0, 'Today']]);
  });

  it('never breaks on a pending send', () => {
    const breaks = dayBreaks(
      [message('1', at(2026, 11, 3, 23, 58)), message('pending:x', at(2026, 11, 4, 0, 1), true)],
      NOW
    );
    expect([...breaks]).toEqual([[0, 'Yesterday']]);
  });

  it('has no divider for pending sends alone', () => {
    expect(dayBreaks([message('pending:x', at(2026, 11, 4, 9), true)], NOW).size).toBe(0);
  });
});
