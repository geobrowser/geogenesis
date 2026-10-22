import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { SharedTimes, formatSlot } from './shared-times';

afterEach(cleanup);

describe('time chip timezone labels', () => {
  const now = new Date('2026-10-22T12:00:00Z');

  it('uses the saved viewer zone for both the day and the time', () => {
    const start = '2026-10-22T16:00:00Z';
    expect(formatSlot(start, now, 'Asia/Tokyo')).toMatch(/^Tomorrow 1:00\s?AM$/);
    expect(formatSlot(start, now, 'Pacific/Honolulu')).toMatch(/^Today 6:00\s?AM$/);
  });

  it('keeps the wall clock correct on both sides of the DST fallback', () => {
    const before = new Date('2026-10-31T12:00:00Z');
    for (const start of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z']) {
      expect(formatSlot(start, before, 'America/New_York')).toMatch(/^Tomorrow 1:30\s?AM$/);
    }
  });

  it('shows the saved-zone time on the visible chip and its accessible name', () => {
    render(
      <SharedTimes
        analyticsSurface="lobby"
        personName="Priya"
        timezone="Asia/Tokyo"
        schedule={{ slots: [{ start: '2026-10-22T16:00:00Z' }], truncated: false }}
        onPick={() => undefined}
      />
    );
    const chip = screen.getByRole('button', { name: /Schedule a debate with Priya.*1:00\s?AM/ });
    expect(chip).toHaveTextContent(/1:00\s?AM/);
  });
});
