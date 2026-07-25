import { describe, expect, it } from 'vitest';

import { EXPLORE_ENTITY_TYPE_IDS } from './explore-constants';
import {
  exploreTypeFilterLabel,
  parseExploreTypeIdsParam,
  parseStoredExploreTypeIds,
  sanitizeExploreTypeIds,
  toggleExploreTypeId,
} from './explore-type-filter';

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
    expect(exploreTypeFilterLabel(8)).toBe('8 types');
  });
});
