import { describe, expect, it } from 'vitest';

import { selectSearchAdditionalSpaceIds } from './search-additional-space-ids';

const GLOBAL_IDS = ['root', 'current', 'personal'];

describe('selectSearchAdditionalSpaceIds', () => {
  it('returns globalAdditionalSpaceIds when includeNonCanonical is omitted (undefined) and unscoped', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toEqual(GLOBAL_IDS);
  });

  it('returns globalAdditionalSpaceIds when includeNonCanonical is explicitly false and unscoped', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: false,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toEqual(GLOBAL_IDS);
  });

  it('returns undefined when includeNonCanonical is explicitly true (unrestricted search), even unscoped', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: true,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toBeUndefined();
  });

  it('returns undefined when scoped to a single space (filterBySpace), regardless of includeNonCanonical', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: 'some-space-id',
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toBeUndefined();

    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: 'some-space-id',
        includeNonCanonical: false,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toBeUndefined();

    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: 'some-space-id',
        includeNonCanonical: true,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toBeUndefined();
  });

  it('treats an empty-string filterBySpace as unscoped (falsy), not as scoping the query', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: '',
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
      })
    ).toEqual(GLOBAL_IDS);
  });
});
