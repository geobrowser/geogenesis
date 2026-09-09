import { describe, expect, it } from 'vitest';

import {
  MAX_SEMANTIC_SPACE_IDS,
  MAX_SEMANTIC_TOPIC_IDS,
  normalizeGeoId,
  parseSemanticClaimSearchRequest,
} from './semantic-claim-search-contract';

const TAG = 'ec3086a54ddf43d8aaefd6cc6e1b0556';
const SPACE = '019fedae72b67ab2927adf044d57c566';
const TOPIC = '5d050707bc5840119b1e81ad3adb6244';

describe('normalizeGeoId', () => {
  it('accepts dashed or dashless ids and answers dashless lowercase', () => {
    expect(normalizeGeoId('EC3086A5-4DDF-43D8-AAEF-D6CC6E1B0556')).toBe(TAG);
    expect(normalizeGeoId(TAG)).toBe(TAG);
  });

  it('refuses anything that is not a Geo id', () => {
    expect(normalizeGeoId('not-an-id')).toBeNull();
    expect(normalizeGeoId(TAG.slice(1))).toBeNull();
    expect(normalizeGeoId(42)).toBeNull();
    expect(normalizeGeoId(null)).toBeNull();
  });
});

describe('parseSemanticClaimSearchRequest', () => {
  it('normalizes every id and trims and caps the query', () => {
    const parsed = parseSemanticClaimSearchRequest({
      query: `  ${'x'.repeat(150)}`,
      tagId: 'EC3086A5-4DDF-43D8-AAEF-D6CC6E1B0556',
      spaceIds: [SPACE.toUpperCase()],
      topicIds: [TOPIC],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.query).toBe('x'.repeat(100));
    expect(parsed.request.tagId).toBe(TAG);
    expect(parsed.request.spaceIds).toEqual([SPACE]);
    expect(parsed.request.topicIds).toEqual([TOPIC]);
  });

  it('reads a missing space list as any space and a missing topic list as none', () => {
    const parsed = parseSemanticClaimSearchRequest({ query: 'q', tagId: TAG, spaceIds: null });
    expect(parsed).toEqual({ ok: true, request: { query: 'q', tagId: TAG, spaceIds: null, topicIds: [] } });
    expect(parseSemanticClaimSearchRequest({ query: 'q', tagId: TAG })).toEqual(parsed);
  });

  it.each([
    ['not an object', 'nope'],
    ['no query', { tagId: TAG }],
    ['a blank query', { query: '   ', tagId: TAG }],
    ['no tag', { query: 'q' }],
    ['a bad tag', { query: 'q', tagId: 'tag' }],
    ['a bad space id', { query: 'q', tagId: TAG, spaceIds: ['space'] }],
    ['a bad topic id', { query: 'q', tagId: TAG, topicIds: [42] }],
    ['too many spaces', { query: 'q', tagId: TAG, spaceIds: Array(MAX_SEMANTIC_SPACE_IDS + 1).fill(SPACE) }],
    ['too many topics', { query: 'q', tagId: TAG, topicIds: Array(MAX_SEMANTIC_TOPIC_IDS + 1).fill(TOPIC) }],
  ])('refuses %s', (_label, body) => {
    expect(parseSemanticClaimSearchRequest(body).ok).toBe(false);
  });
});
