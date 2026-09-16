import { describe, expect, it } from 'vitest';

import { MAX_SEARCH_ADDITIONAL_SPACE_IDS } from './global-search-space-ids';
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

/**
 * The branch that makes a curated taxonomy findable: 4,014 ESCO roles sit in a
 * space almost nobody is a member of, so a picker that knows where they live
 * says so explicitly rather than hoping the global list happens to include it.
 */
describe('spaces the caller names', () => {
  it('puts them ahead of the global list', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
        alsoSearchSpaceIds: ['taxonomy-space'],
      })
    ).toEqual(['taxonomy-space', ...GLOBAL_IDS]);
  });

  it('does not list a space twice when the global list already has it', () => {
    const result = selectSearchAdditionalSpaceIds({
      filterBySpace: undefined,
      includeNonCanonical: undefined,
      globalAdditionalSpaceIds: GLOBAL_IDS,
      alsoSearchSpaceIds: [GLOBAL_IDS[0]],
    });

    expect(result).toEqual(GLOBAL_IDS);
    expect(new Set(result).size).toBe(result?.length);
  });

  // The whole point of putting them first: the list is capped, and a space asked
  // for by name is a worse thing to drop than the hundredth space someone edits.
  it('keeps them when the cap drops everything else', () => {
    const crowded = Array.from({ length: MAX_SEARCH_ADDITIONAL_SPACE_IDS + 50 }, (_, i) => `space-${i}`);

    const result = selectSearchAdditionalSpaceIds({
      filterBySpace: undefined,
      includeNonCanonical: undefined,
      globalAdditionalSpaceIds: crowded,
      alsoSearchSpaceIds: ['taxonomy-space'],
    });

    expect(result).toHaveLength(MAX_SEARCH_ADDITIONAL_SPACE_IDS);
    expect(result?.[0]).toBe('taxonomy-space');
  });

  // Naming a space cannot widen a search that was deliberately narrowed to one,
  // nor one already asking for everything.
  it('is ignored where the global list would be', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: 'some-space-id',
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
        alsoSearchSpaceIds: ['taxonomy-space'],
      })
    ).toBeUndefined();

    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: true,
        globalAdditionalSpaceIds: GLOBAL_IDS,
        alsoSearchSpaceIds: ['taxonomy-space'],
      })
    ).toBeUndefined();
  });

  it('falls back to the global list when the caller names none', () => {
    expect(
      selectSearchAdditionalSpaceIds({
        filterBySpace: undefined,
        includeNonCanonical: undefined,
        globalAdditionalSpaceIds: GLOBAL_IDS,
        alsoSearchSpaceIds: [],
      })
    ).toEqual(GLOBAL_IDS);
  });
});
