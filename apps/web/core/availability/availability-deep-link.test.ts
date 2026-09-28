import { describe, expect, it } from 'vitest';

import { requestsModal } from '~/core/deep-links/modal-deep-link';

import {
  AVAILABILITY_MODAL,
  availabilityLinkUrl,
  profileSpaceIdFromPath,
  toAvailability,
} from './availability-deep-link';

describe('availability deep link', () => {
  it("lands on the person's profile, which is what names them", () => {
    expect(toAvailability('abc123')).toBe('/space/abc123?modal=availability');
    expect(availabilityLinkUrl('abc123', 'https://geo.example')).toBe(
      'https://geo.example/space/abc123?modal=availability'
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
});
