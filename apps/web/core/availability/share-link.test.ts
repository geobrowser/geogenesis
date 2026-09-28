import { describe, expect, it } from 'vitest';

import {
  availabilityLinkPath,
  availabilityLinkUrl,
  hasAvailabilityLinkParam,
  withoutAvailabilityLinkParam,
} from './share-link';

describe('availability links', () => {
  it('points at the profile with the parameter that opens the week', () => {
    expect(availabilityLinkPath('abc123')).toBe('/space/abc123?availability=1');
    expect(availabilityLinkUrl('abc123', 'https://geo.example')).toBe('https://geo.example/space/abc123?availability=1');
  });

  it('recognises the parameter whatever its value', () => {
    expect(hasAvailabilityLinkParam(new URLSearchParams('availability=1'))).toBe(true);
    expect(hasAvailabilityLinkParam(new URLSearchParams('availability'))).toBe(true);
    expect(hasAvailabilityLinkParam(new URLSearchParams('tab=claims'))).toBe(false);
    expect(hasAvailabilityLinkParam(null)).toBe(false);
  });

  it('drops only its own parameter when putting the URL back', () => {
    expect(withoutAvailabilityLinkParam('/space/abc', 'availability=1')).toBe('/space/abc');
    expect(withoutAvailabilityLinkParam('/space/abc', 'availability=1&tab=claims')).toBe('/space/abc?tab=claims');
  });
});
