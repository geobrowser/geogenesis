import { describe, expect, it } from 'vitest';

import { requestsModal } from '~/core/deep-links/modal-deep-link';

import {
  AVAILABILITY_MODAL,
  availabilityLinkUrl,
  profileSpaceIdFromPath,
  rescheduleRequestIdFromTarget,
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
    expect(rescheduleRequestIdFromTarget('6676b145-0970-4c1c-bfbc-7497d9721b39')).toBe(
      '6676b145-0970-4c1c-bfbc-7497d9721b39'
    );
    expect(rescheduleRequestIdFromTarget(null)).toBeNull();
    expect(rescheduleRequestIdFromTarget('people')).toBeNull();
    expect(rescheduleRequestIdFromTarget('6676b1450970')).toBeNull();
  });
});
