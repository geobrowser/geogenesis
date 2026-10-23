import { describe, expect, it } from 'vitest';

import { spaceIdMatcher } from './space-id-matcher';

const LISTED = '879dc356d44f41ffbefae156d1db31c2';
const LISTED_UUID = '879dc356-d44f-41ff-befa-e156d1db31c2';

describe('spaceIdMatcher', () => {
  it('matches a listed space and nobody else', () => {
    const matches = spaceIdMatcher([LISTED]);

    expect(matches(LISTED)).toBe(true);
    expect(matches('019fedae72b67ab2927adf044d57c566')).toBe(false);
  });

  it('matches across hyphenated, bare and upper-case spellings, on either side', () => {
    expect(spaceIdMatcher([LISTED])(LISTED_UUID)).toBe(true);
    expect(spaceIdMatcher([LISTED_UUID])(LISTED)).toBe(true);
    expect(spaceIdMatcher([LISTED])(LISTED.toUpperCase())).toBe(true);
  });

  it('matches nothing for a missing id', () => {
    const matches = spaceIdMatcher([LISTED]);

    expect(matches(null)).toBe(false);
    expect(matches(undefined)).toBe(false);
    expect(matches('')).toBe(false);
  });
});
