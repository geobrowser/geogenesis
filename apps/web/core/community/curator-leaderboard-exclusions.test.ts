import { describe, expect, it } from 'vitest';

import { EXCLUDED_CURATOR_SPACE_IDS, isExcludedCurator } from './curator-leaderboard-exclusions';

const EXCLUDED = EXCLUDED_CURATOR_SPACE_IDS[0];
const SOMEONE_ELSE = '019fedae72b67ab2927adf044d57c566';

describe('isExcludedCurator', () => {
  it('excludes a listed personal space', () => {
    expect(isExcludedCurator(EXCLUDED)).toBe(true);
  });

  it('leaves everyone else alone', () => {
    expect(isExcludedCurator(SOMEONE_ELSE)).toBe(false);
  });

  // Curator ids reach this from several sources — relation `spaceId`s, proposal authors, the
  // viewer's own id off a query string — and they don't agree on a format.
  it('matches the same space written as a hyphenated uuid', () => {
    const uuid = [
      EXCLUDED.slice(0, 8),
      EXCLUDED.slice(8, 12),
      EXCLUDED.slice(12, 16),
      EXCLUDED.slice(16, 20),
      EXCLUDED.slice(20),
    ].join('-');

    expect(isExcludedCurator(uuid)).toBe(true);
  });

  it('matches regardless of case', () => {
    expect(isExcludedCurator(EXCLUDED.toUpperCase())).toBe(true);
  });

  // "No curator" is not an excluded curator — callers pass a nullable viewer id straight in.
  it('treats a missing id as not excluded', () => {
    expect(isExcludedCurator(null)).toBe(false);
    expect(isExcludedCurator(undefined)).toBe(false);
    expect(isExcludedCurator('')).toBe(false);
  });
});

describe('EXCLUDED_CURATOR_SPACE_IDS', () => {
  // The list is hand-maintained, so a typo is the likeliest way it breaks: an id that isn't a
  // 32-character hex space id silently matches nobody.
  it('holds only well-formed space ids', () => {
    for (const id of EXCLUDED_CURATOR_SPACE_IDS) {
      expect(id.replace(/-/g, '').toLowerCase()).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
