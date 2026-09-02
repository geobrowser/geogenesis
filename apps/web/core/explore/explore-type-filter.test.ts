import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPE_IDS, NEWS_STORY_TYPE_ID } from './explore-constants';
import {
  exploreTypeFilterLabel,
  parseExploreTypeIdsParam,
  parseStoredExploreTypeIds,
  sanitizeExploreTypeIds,
  toggleExploreTypeId,
} from './explore-type-filter';

describe('Explore default types', () => {
  // Pinned by ID, never by label: the menu string is display copy, and matching on it would make
  // a rename silently change which types a reader arrives with.
  it('arrives with news story, debate and claim selected', () => {
    expect(DEFAULT_EXPLORE_TYPE_IDS).toEqual([NEWS_STORY_TYPE_ID, DEBATE_TYPE_ID, CLAIM_TYPE_ID]);
    expect(parseStoredExploreTypeIds(null)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
  });

  it('lists the defaults first, so the boxes on arrival are the ones seen first', () => {
    // The dropdown maps `EXPLORE_ENTITY_TYPES` directly, so this array is the menu order. Debate and
    // Claim used to sit at the bottom of it, which put two of the three checked boxes out of view.
    expect(EXPLORE_ENTITY_TYPE_IDS.slice(0, DEFAULT_EXPLORE_TYPE_IDS.length)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
  });

  it('keeps every type available to choose', () => {
    // The scope of GEO-2790 is what is checked on arrival, not what the feed can show. Every
    // default has to still be an option, and the options list has to still be the longer one.
    for (const id of DEFAULT_EXPLORE_TYPE_IDS) expect(EXPLORE_ENTITY_TYPE_IDS).toContain(id);
    expect(EXPLORE_ENTITY_TYPE_IDS.length).toBeGreaterThan(DEFAULT_EXPLORE_TYPE_IDS.length);
  });

  it('orders the default the way a hand-picked selection would be ordered', () => {
    // `sanitizeExploreTypeIds` sorts into `EXPLORE_ENTITY_TYPES` order, and the feed compares
    // selections by length and by joined key — so a default in a different order would look like a
    // different selection from the same three types ticked by hand.
    expect(sanitizeExploreTypeIds(DEFAULT_EXPLORE_TYPE_IDS)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
    expect(sanitizeExploreTypeIds([CLAIM_TYPE_ID, DEBATE_TYPE_ID, NEWS_STORY_TYPE_ID])).toEqual(
      DEFAULT_EXPLORE_TYPE_IDS
    );
  });

  it('does not narrow the API when the client sends no types param', () => {
    // The trap this change had to avoid. `entity-feed` omits `typeIds` *precisely when every type
    // is selected*, so if the server read a missing param as the default three, ticking all twelve
    // boxes would hand back three types. The two defaults are separate functions for this reason.
    expect(parseExploreTypeIdsParam(null)).toEqual(EXPLORE_ENTITY_TYPE_IDS);
    expect(parseExploreTypeIdsParam(null)).not.toEqual(DEFAULT_EXPLORE_TYPE_IDS);
  });

  it('leaves a reader who chose their own types alone', () => {
    // Only a deliberate toggle writes the key, so anything stored is someone having said what they
    // want. The new default is for people who never said.
    expect(parseStoredExploreTypeIds(JSON.stringify([NEWS_STORY_TYPE_ID]))).toEqual([NEWS_STORY_TYPE_ID]);
    expect(parseStoredExploreTypeIds(JSON.stringify(EXPLORE_ENTITY_TYPE_IDS))).toEqual(EXPLORE_ENTITY_TYPE_IDS);
  });
});

describe('parseStoredExploreTypeIds', () => {
  it('falls back to the default selection when the cache is missing or corrupt', () => {
    expect(parseStoredExploreTypeIds(null)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
    expect(parseStoredExploreTypeIds('not-json')).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
    expect(parseStoredExploreTypeIds('{}')).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
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
