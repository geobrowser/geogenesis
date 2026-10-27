import { describe, expect, it } from 'vitest';

import { EXCLUDED_PEOPLE_TAB_SPACE_IDS } from './people-tab-exclusions';

describe('EXCLUDED_PEOPLE_TAB_SPACE_IDS', () => {
  // The list is hand-maintained, so a typo is the likeliest way it breaks: an id that isn't a
  // 32-character hex space id silently matches nobody.
  it('holds only well-formed space ids', () => {
    for (const id of EXCLUDED_PEOPLE_TAB_SPACE_IDS) {
      expect(id.replace(/-/g, '').toLowerCase()).toMatch(/^[0-9a-f]{32}$/);
    }
  });
});
