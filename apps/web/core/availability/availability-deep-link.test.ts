import { describe, expect, it } from 'vitest';

import { requestsModal } from '~/core/deep-links/modal-deep-link';

import {
  AVAILABILITY_MODAL,
  availabilityLinkUrl,
  profileSpaceIdFromPath,
  requestIdFromTarget,
  startFromTarget,
  toAvailability,
} from './availability-deep-link';

describe('availability deep link', () => {
  it("lands on the person's profile, which is what names them", () => {
    expect(toAvailability('abc123')).toBe('/space/abc123?modal=availability');
  });

  it('marks a copied link as shared', () => {
    expect(availabilityLinkUrl('abc123', 'https://geo.example')).toBe(
      'https://geo.example/space/abc123?modal=availability&via=share'
    );
  });

  it('reads the person from a space root and nowhere deeper', () => {
    expect(profileSpaceIdFromPath(['space', 'abc123'])).toBe('abc123');
    expect(profileSpaceIdFromPath(['space', 'abc123', 'entity'])).toBeNull();
    expect(profileSpaceIdFromPath(['explore'])).toBeNull();
    expect(profileSpaceIdFromPath([])).toBeNull();
  });

  it('round-trips through the shared reader', () => {
    const params = new URL(availabilityLinkUrl('abc123', 'https://geo.example')).searchParams;
    expect(requestsModal(params, AVAILABILITY_MODAL)).toBe(true);
  });

  // What a scheduling email's "Choose different time" links to: the other person's week, moving the
  // request the email is about.
  it('names the request to move in modalTarget', () => {
    const requestId = '6676b145-0970-4c1c-bfbc-7497d9721b39';
    expect(toAvailability('abc123', { rescheduleRequestId: requestId })).toBe(
      `/space/abc123?modal=availability&modalTarget=${requestId}`
    );
    expect(toAvailability('abc123', { rescheduleRequestId: null })).toBe('/space/abc123?modal=availability');
  });

  it('only reads a request id as something to reschedule', () => {
    expect(requestIdFromTarget('6676b145-0970-4c1c-bfbc-7497d9721b39')).toBe('6676b145-0970-4c1c-bfbc-7497d9721b39');
    expect(requestIdFromTarget(null)).toBeNull();
    expect(requestIdFromTarget('people')).toBeNull();
    expect(requestIdFromTarget('6676b1450970')).toBeNull();
    // geo-chat's JSON spells the same id without dashes.
    expect(requestIdFromTarget('6676b14509704c1cbfbc7497d9721b39')).toBe('6676b14509704c1cbfbc7497d9721b39');
  });
});

// GEO-3429: "none of these work"'s emailed times open the mover's week with that time picked.
describe('a picked time in the link', () => {
  it('reads an instant as geo-chat writes it', () => {
    expect(startFromTarget('2026-10-23T13:00:00Z')).toBe('2026-10-23T13:00:00.000Z');
    expect(startFromTarget('2026-10-23T13:00Z')).toBe('2026-10-23T13:00:00.000Z');
  });

  it('ignores a request id, a tab or anything zoned other than UTC', () => {
    expect(startFromTarget('6676b145-0970-4c1c-bfbc-7497d9721b39')).toBeNull();
    expect(startFromTarget('people')).toBeNull();
    expect(startFromTarget('2026-10-23T13:00:00+02:00')).toBeNull();
    expect(startFromTarget('2026-13-45T99:00:00Z')).toBeNull();
    expect(startFromTarget(null)).toBeNull();
  });

  it('is never taken for a request to move, so the week books a new one', () => {
    expect(requestIdFromTarget('2026-10-23T13:00:00Z')).toBeNull();
  });

  it('round-trips through the link, for a recipient sent to sign in first', () => {
    expect(toAvailability('abc123', { pickedStart: '2026-10-23T13:00:00Z' })).toBe(
      '/space/abc123?modal=availability&modalTarget=2026-10-23T13%3A00%3A00Z'
    );
  });
});
