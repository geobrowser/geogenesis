import { describe, expect, it } from 'vitest';

import { parseScheduledParams, scheduledCallsTabHref, seriesSynced } from './after-publish';

const schedule = 'DTSTART;TZID=America/New_York:20261104T120000\nRRULE:FREQ=WEEKLY';

describe('scheduled params', () => {
  it('round-trips through the Calls tab href', () => {
    const href = scheduledCallsTabHref('space1', { seriesId: 'SERIES-1', outcome: 'pending', schedule });
    expect(href.startsWith('/space/space1/calls?scheduled=series1&outcome=pending&schedule=')).toBe(true);
    expect(parseScheduledParams(new URL(href, 'https://x').searchParams)).toEqual({
      seriesId: 'series1',
      outcome: 'pending',
      schedule,
    });
  });

  it('ignores a missing series or an unknown outcome', () => {
    expect(parseScheduledParams(new URLSearchParams('outcome=executed'))).toBeNull();
    expect(parseScheduledParams(new URLSearchParams('scheduled=s&outcome=done'))).toBeNull();
  });
});

describe('seriesSynced', () => {
  const row = (s: string) => ({
    series_id: 'series1',
    name: 'n',
    description: null,
    schedule: s,
    one_off: false,
  });

  it('waits for the series with the schedule that was published', () => {
    const params = { seriesId: 'SERIES-1', outcome: 'executed' as const, schedule };
    expect(seriesSynced(undefined, params)).toBe(false);
    expect(seriesSynced({ series: [] }, params)).toBe(false);
    expect(seriesSynced({ series: [row('DTSTART:20261001T120000Z')] }, params)).toBe(false);
    expect(seriesSynced({ series: [row(schedule)] }, params)).toBe(true);
    expect(seriesSynced({ series: [row(`  ${schedule.replace(/\n/g, '\r\n')}\n`)] }, params)).toBe(true);
  });
});
