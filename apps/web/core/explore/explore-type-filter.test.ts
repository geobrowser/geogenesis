import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { EXPLORE_ENTITY_TYPE_IDS } from './explore-constants';
import {
  exploreTypeFilterLabel,
  parseExploreTypeIdsParam,
  parseStoredExploreTypeIds,
  sanitizeExploreTypeIds,
  toggleExploreTypeId,
} from './explore-type-filter';

describe('Explore default types', () => {
  // The rest of this suite is written against EXPLORE_ENTITY_TYPE_IDS, so it follows the
  // list wherever it goes and would stay green if a type were dropped. Claim is pinned
  // explicitly: Explore is where claims get discovered, so it defaulting off is a
  // regression rather than a preference.
  //
  // Asserted by ID only. The menu label is display copy, and the entry's shape is already
  // a compile-time guarantee, so pinning the string here would only fail on a rename.
  it('includes Claim, selected by default', () => {
    expect(EXPLORE_ENTITY_TYPE_IDS).toContain(CLAIM_TYPE_ID);
    expect(parseStoredExploreTypeIds(null)).toContain(CLAIM_TYPE_ID);
    expect(parseExploreTypeIdsParam(null)).toContain(CLAIM_TYPE_ID);
  });
});

describe('parseStoredExploreTypeIds', () => {
  it('defaults to every Explore type when cache is missing or corrupt', () => {
    expect(parseStoredExploreTypeIds(null)).toEqual(EXPLORE_ENTITY_TYPE_IDS);
    expect(parseStoredExploreTypeIds('not-json')).toEqual(EXPLORE_ENTITY_TYPE_IDS);
    expect(parseStoredExploreTypeIds('{}')).toEqual(EXPLORE_ENTITY_TYPE_IDS);
  });

  it('preserves a deliberately empty cached selection', () => {
    expect(parseStoredExploreTypeIds('[]')).toEqual([]);
  });

  it('keeps only allowed IDs in canonical Explore order', () => {
    const [first, second] = EXPLORE_ENTITY_TYPE_IDS;
    expect(parseStoredExploreTypeIds(JSON.stringify([second, 'unknown', first, second]))).toEqual([first, second]);
  });
});

describe('parseExploreTypeIdsParam', () => {
  it('defaults a missing parameter to all types and preserves an empty selection', () => {
    expect(parseExploreTypeIdsParam(null)).toEqual(EXPLORE_ENTITY_TYPE_IDS);
    expect(parseExploreTypeIdsParam('')).toEqual([]);
  });

  it('rejects unknown IDs and accepts hyphenated allowed IDs', () => {
    const first = EXPLORE_ENTITY_TYPE_IDS[0];
    const hyphenated = `${first.slice(0, 8)}-${first.slice(8, 12)}-${first.slice(12, 16)}-${first.slice(16, 20)}-${first.slice(20)}`;
    expect(parseExploreTypeIdsParam(`${hyphenated},unknown`)).toEqual([first]);
  });
});

describe('sanitizeExploreTypeIds', () => {
  it('ignores non-string values', () => {
    expect(sanitizeExploreTypeIds([null, 42, EXPLORE_ENTITY_TYPE_IDS[0]])).toEqual([EXPLORE_ENTITY_TYPE_IDS[0]]);
  });
});

describe('toggleExploreTypeId', () => {
  it('checks and unchecks types while preserving canonical order', () => {
    const [first, second] = EXPLORE_ENTITY_TYPE_IDS;
    expect(toggleExploreTypeId([first, second], first)).toEqual([second]);
    expect(toggleExploreTypeId([second], first)).toEqual([first, second]);
  });

  it('ignores unknown type IDs', () => {
    expect(toggleExploreTypeId(EXPLORE_ENTITY_TYPE_IDS, 'unknown')).toEqual(EXPLORE_ENTITY_TYPE_IDS);
  });
});

describe('exploreTypeFilterLabel', () => {
  it('formats the selected type count', () => {
    expect(exploreTypeFilterLabel(0)).toBe('0 types');
    expect(exploreTypeFilterLabel(1)).toBe('1 type');
    expect(exploreTypeFilterLabel(11)).toBe('11 types');
  });
});
