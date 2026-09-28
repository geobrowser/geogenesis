import { describe, expect, it } from 'vitest';

import { modalTarget, requestsModal } from '~/core/deep-links/modal-deep-link';

import { AVAILABILITY_MODAL, availabilityLinkUrl, toAvailability } from './availability-deep-link';

describe('availability deep link', () => {
  it("lands on the person's profile and names them as the target", () => {
    expect(toAvailability('abc123')).toBe('/space/abc123?modal=availability&modalTarget=abc123');
    expect(availabilityLinkUrl('abc123', 'https://geo.example')).toBe(
      'https://geo.example/space/abc123?modal=availability&modalTarget=abc123'
    );
  });

  it('round-trips through the shared reader', () => {
    const params = new URL(availabilityLinkUrl('abc123', 'https://geo.example')).searchParams;
    expect(requestsModal(params, AVAILABILITY_MODAL)).toBe(true);
    expect(modalTarget(params)).toBe('abc123');
  });
});
