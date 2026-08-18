import { describe, expect, it } from 'vitest';

import { RECORDING_NOTICE, buildGoogleCalendarHref, buildOutlookCalendarHref, buildSeriesIcsBody } from './format';

/** RFC 5545 line-folding inserts `\r\n ` mid-value for long lines — undo that before
 *  asserting on a field's full text. */
function unfold(body: string): string {
  return body.replace(/\r\n /g, '');
}

describe('buildGoogleCalendarHref', () => {
  it('points at the eventedit endpoint, matching curator', () => {
    const href = buildGoogleCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/u/0/r/eventedit');
  });

  it('adds a ctz param when a timezone is given', () => {
    const href = buildGoogleCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
      timezone: 'America/Los_Angeles',
    });
    expect(new URL(href).searchParams.get('ctz')).toBe('America/Los_Angeles');
  });

  it('omits ctz when no timezone is given', () => {
    const href = buildGoogleCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
    });
    expect(new URL(href).searchParams.has('ctz')).toBe(false);
  });

  it('replaces the description with a join link + recording notice, never the raw description', () => {
    const href = buildGoogleCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
      joinUrl: 'https://geobrowser.io/space/s1/community/call/c1',
    });
    const details = new URL(href).searchParams.get('details');
    expect(details).toBe(`Join the call: https://geobrowser.io/space/s1/community/call/c1\n\n${RECORDING_NOTICE}`);
    expect(new URL(href).searchParams.get('location')).toBe('https://geobrowser.io/space/s1/community/call/c1');
  });
});

describe('buildOutlookCalendarHref', () => {
  it('points at the office.com deep link, matching curator', () => {
    const href = buildOutlookCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
    });
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe('https://outlook.office.com/calendar/deeplink/compose');
  });

  it('replaces the description with a join link + recording notice', () => {
    const href = buildOutlookCalendarHref({
      name: 'Sync',
      startMs: Date.UTC(2026, 2, 8, 16, 0),
      endMs: Date.UTC(2026, 2, 8, 17, 0),
      joinUrl: 'https://geobrowser.io/space/s1/community/call/c1',
    });
    const body = new URL(href).searchParams.get('body');
    expect(body).toBe(`Join the call: https://geobrowser.io/space/s1/community/call/c1\n\n${RECORDING_NOTICE}`);
    expect(new URL(href).searchParams.get('location')).toBe('https://geobrowser.io/space/s1/community/call/c1');
  });
});

describe('buildSeriesIcsBody', () => {
  it('prepends a VTIMEZONE block derived from the schedule’s TZID', () => {
    const body = buildSeriesIcsBody({
      callId: 'call-1',
      name: 'Weekly sync',
      schedule:
        'DTSTART;TZID=America/Los_Angeles:20260301T090000\nDTEND;TZID=America/Los_Angeles:20260301T100000\nRRULE:FREQ=WEEKLY;BYDAY=SU',
    });
    expect(body).toContain('BEGIN:VTIMEZONE');
    expect(body).toContain('TZID:America/Los_Angeles');
    // Both the STANDARD and DAYLIGHT components should show up for a DST-observing zone.
    expect(body).toContain('BEGIN:STANDARD');
    expect(body).toContain('BEGIN:DAYLIGHT');
  });

  it('omits VTIMEZONE for a legacy no-TZID schedule', () => {
    const body = buildSeriesIcsBody({
      callId: 'call-1',
      name: 'Weekly sync',
      schedule: 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH',
    });
    expect(body).not.toContain('VTIMEZONE');
  });

  it('emits URL/LOCATION and a description built from the join link + recording notice, never the raw description', () => {
    const body = buildSeriesIcsBody({
      callId: 'call-1',
      name: 'Weekly sync',
      schedule: 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH',
      joinUrl: 'https://geobrowser.io/space/s1/community/call/call-1',
    });
    const flat = unfold(body);
    expect(flat).toContain('URL:https://geobrowser.io/space/s1/community/call/call-1');
    expect(flat).toContain('LOCATION:https://geobrowser.io/space/s1/community/call/call-1');
    expect(flat).toContain(
      `DESCRIPTION:Join the call: https://geobrowser.io/space/s1/community/call/call-1\\n\\n${RECORDING_NOTICE.replace(/,/g, '\\,')}`
    );
  });

  it('falls back to the bare recording notice with no URL/LOCATION when there is no join link', () => {
    const body = buildSeriesIcsBody({
      callId: 'call-1',
      name: 'Weekly sync',
      schedule: 'DTSTART:20260305T170000Z\nDTEND:20260305T180000Z\nRRULE:FREQ=WEEKLY;BYDAY=TH',
    });
    expect(body).not.toContain('URL:');
    expect(body).not.toContain('LOCATION:');
    expect(unfold(body)).toContain(`DESCRIPTION:${RECORDING_NOTICE.replace(/,/g, '\\,')}`);
  });
});
