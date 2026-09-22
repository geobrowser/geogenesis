import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import {
  decodeSpaceDebateActivityCounts,
  parseSpaceActivityKindFromTypeIds,
  spaceActivityFeedEndpoint,
  spaceActivityFeedHref,
} from './space-debate-activity';

describe('parseSpaceActivityKindFromTypeIds', () => {
  it('reads the two kinds this surface is about', () => {
    expect(parseSpaceActivityKindFromTypeIds(DEBATE_TYPE_ID)).toBe('debates');
    expect(parseSpaceActivityKindFromTypeIds(CLAIM_TYPE_ID)).toBe('claims');
  });

  it('accepts the dashed spelling of the same id', () => {
    const dashed = `${DEBATE_TYPE_ID.slice(0, 8)}-${DEBATE_TYPE_ID.slice(8)}`;
    expect(parseSpaceActivityKindFromTypeIds(dashed)).toBe('debates');
  });

  // The endpoint behind this is a space-scoped Explore reader with no type menu. Widening it by
  // accident is how it stops being "this space's debates" and starts being a general feed.
  it('rejects anything that is not exactly one of those two types', () => {
    expect(parseSpaceActivityKindFromTypeIds(null)).toBeNull();
    expect(parseSpaceActivityKindFromTypeIds('')).toBeNull();
    expect(parseSpaceActivityKindFromTypeIds(`${DEBATE_TYPE_ID},${CLAIM_TYPE_ID}`)).toBeNull();
    expect(parseSpaceActivityKindFromTypeIds('e550fe517e904b2c8fffdf13408f5634')).toBeNull();
  });
});

describe('spaceActivityFeedHref', () => {
  // Deliberately not `/space/<id>/debates` (the full-bleed player) or `/space/<id>/claims` (the
  // editor surface). A test, because both are live routes that would silently take these over.
  it('points at the space-scoped explore routes', () => {
    expect(spaceActivityFeedHref('space-1', 'debates')).toBe('/space/space-1/explore/debates');
    expect(spaceActivityFeedHref('space-1', 'claims')).toBe('/space/space-1/explore/claims');
  });

  it('reads the feed from the space-pinned endpoint', () => {
    expect(spaceActivityFeedEndpoint('space-1')).toBe('/api/space/space-1/debate-activity/feed');
  });
});

describe('decodeSpaceDebateActivityCounts', () => {
  const relations = (ids: string[], totalCount = ids.length) => ({
    totalCount,
    nodes: ids.map(fromEntityId => ({ fromEntityId })),
  });

  // The same trap `fetch-profile-facts` documents: one debate can carry its `Types -> Debate`
  // relation more than once, and counting rows reports more debates than exist. Measured 32
  // relations across 29 debates on one testnet space.
  it('counts distinct debates rather than their type relations', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: relations(['a', 'a', 'b']),
      taggedClaims: { totalCount: 7 },
    });

    expect(counts.debates).toBe(2);
    expect(counts.claims).toBe(7);
  });

  it('treats two spellings of one id as one debate', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: relations(['019F6B2B-7622-7932', '019f6b2b76227932']),
      taggedClaims: { totalCount: 0 },
    });

    expect(counts.debates).toBe(1);
  });

  // Past the 500-row window the distinct count is a lower bound over a partial read, and a number
  // that silently stops growing is worse than one that over-counts by a few percent.
  it('falls back to the reported total when the window was truncated', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: { totalCount: 900, nodes: [{ fromEntityId: 'a' }, { fromEntityId: 'b' }] },
      taggedClaims: { totalCount: 1 },
    });

    expect(counts.debates).toBe(900);
  });

  // `null` means "could not be read", which the card draws as a dash. A zero here would be the
  // page stating, confidently and wrongly, that the space has never held a debate.
  it('reports an unreadable count as null rather than zero', () => {
    const counts = decodeSpaceDebateActivityCounts({ debateTypeRelations: null, taggedClaims: null });

    expect(counts.debates).toBeNull();
    expect(counts.claims).toBeNull();
  });

  it('keeps a real zero apart from an unreadable one', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: relations([]),
      taggedClaims: { totalCount: 0 },
    });

    expect(counts.debates).toBe(0);
    expect(counts.claims).toBe(0);
  });
});
