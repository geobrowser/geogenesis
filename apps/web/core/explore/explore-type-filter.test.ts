import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { DEFAULT_EXPLORE_TYPE_IDS, EXPLORE_ENTITY_TYPE_IDS, NEWS_STORY_TYPE_ID } from './explore-constants';
import {
  entityMatchesExploreTypeIds,
  exploreTypeFilterLabel,
  parseExploreTypeIdsParam,
  parseStoredExploreTypeIds,
  sanitizeExploreTypeIds,
  toggleExploreTypeId,
} from './explore-type-filter';

describe('Explore default types', () => {
  // Pinned by ID, never by label: the label is display copy, and matching on it would make a
  // rename silently change what the feed holds.
  it('is debates and claims', () => {
    expect(DEFAULT_EXPLORE_TYPE_IDS).toEqual([DEBATE_TYPE_ID, CLAIM_TYPE_ID]);
  });

  it('never includes news stories, even when a client asks for them', () => {
    // Explore no longer shows news stories. Off the list entirely, so a kept link or an older
    // client naming the type is sanitized away rather than served.
    expect(EXPLORE_ENTITY_TYPE_IDS).not.toContain(NEWS_STORY_TYPE_ID);
    expect(parseExploreTypeIdsParam(NEWS_STORY_TYPE_ID)).toEqual([]);
    expect(parseExploreTypeIdsParam(`${NEWS_STORY_TYPE_ID},${DEBATE_TYPE_ID}`)).toEqual([DEBATE_TYPE_ID]);
  });

  it('orders the default the way a hand-picked selection would be ordered', () => {
    // `sanitizeExploreTypeIds` sorts into `EXPLORE_ENTITY_TYPES` order, and the feed compares
    // selections by joined key — so a default in a different order would look like a different
    // selection.
    expect(sanitizeExploreTypeIds(DEFAULT_EXPLORE_TYPE_IDS)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
    expect(sanitizeExploreTypeIds([CLAIM_TYPE_ID, DEBATE_TYPE_ID])).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
  });

  it('is what the API serves when the client sends no types param', () => {
    // Explore has no types menu, so its client never sends one: the server decides the feed.
    expect(parseExploreTypeIdsParam(null)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
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
  it('defaults a missing parameter to the Explore types and preserves an empty selection', () => {
    expect(parseExploreTypeIdsParam(null)).toEqual(DEFAULT_EXPLORE_TYPE_IDS);
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

// GEO-2793. Best stopped sending `typeIds` to the server, because supplying it makes
// `entities_ranked_for_feed` sort all ~48.9M rows of `entity_ranking_scores` instead of walking
// its ranked index — 43ms without, 5.8s with twelve types, statement timeout with one rare type.
// This predicate is what replaces it, so it has to mean the same thing the SQL predicate did.
describe('entityMatchesExploreTypeIds', () => {
  const entity = (...typeIds: string[]) => ({ types: typeIds.map(id => ({ id })) });

  it('keeps an entity carrying any one of the selected types', () => {
    expect(entityMatchesExploreTypeIds(entity(DEBATE_TYPE_ID), [NEWS_STORY_TYPE_ID, DEBATE_TYPE_ID])).toBe(true);
    expect(entityMatchesExploreTypeIds(entity(CLAIM_TYPE_ID, DEBATE_TYPE_ID), [DEBATE_TYPE_ID])).toBe(true);
  });

  it('drops an entity carrying none of them', () => {
    expect(entityMatchesExploreTypeIds(entity(CLAIM_TYPE_ID), [NEWS_STORY_TYPE_ID, DEBATE_TYPE_ID])).toBe(false);
  });

  // The server predicate is an EXISTS on a TYPES relation, so an untyped entity never matched it
  // either. Keeping it here would surface rows the old query provably excluded.
  it('drops an untyped entity when a selection is active', () => {
    expect(entityMatchesExploreTypeIds(entity(), [DEBATE_TYPE_ID])).toBe(false);
  });

  // An empty selection is "no restriction", matching the server reading a missing argument the
  // same way. If this returned false the feed would go blank rather than unfiltered.
  it('keeps everything when nothing is selected', () => {
    expect(entityMatchesExploreTypeIds(entity(), [])).toBe(true);
    expect(entityMatchesExploreTypeIds(entity(CLAIM_TYPE_ID), [])).toBe(true);
  });

  // Ids reach this from two directions — the constants are unhyphenated, a card's relation ids
  // come back from the API hyphenated — so comparing them raw silently matches nothing.
  it('matches regardless of hyphenation or case', () => {
    const hyphenated = 'fd51f935-2063-4617-be39-7b672b23364c';
    expect(hyphenated.replace(/-/g, '')).toBe(DEBATE_TYPE_ID);
    expect(entityMatchesExploreTypeIds(entity(hyphenated), [DEBATE_TYPE_ID])).toBe(true);
    expect(entityMatchesExploreTypeIds(entity(DEBATE_TYPE_ID.toUpperCase()), [DEBATE_TYPE_ID])).toBe(true);
    expect(entityMatchesExploreTypeIds(entity(DEBATE_TYPE_ID), [hyphenated])).toBe(true);
  });

  it('accepts the full twelve-type whitelist the menu can produce', () => {
    for (const id of EXPLORE_ENTITY_TYPE_IDS) {
      expect(entityMatchesExploreTypeIds(entity(id), [...EXPLORE_ENTITY_TYPE_IDS])).toBe(true);
    }
  });
});
