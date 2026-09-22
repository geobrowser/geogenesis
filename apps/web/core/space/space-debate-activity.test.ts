import { describe, expect, it } from 'vitest';

import { decodeSpaceDebateActivityCounts, spaceActivityFeedHref } from './space-debate-activity';

describe('spaceActivityFeedHref', () => {
  // The space's own tabs, not a second pair of surfaces beside them. Both are ranked — the debates
  // feed by `useDebatesBestOrder`, the claims tab by `RANKING_SCORE_DESC` — which is what makes
  // them the right end of a "See all" from a card that ranks its six the same way.
  it('points at the space’s own debates and claims tabs', () => {
    expect(spaceActivityFeedHref('space-1', 'debates')).toBe('/space/space-1/debates');
    expect(spaceActivityFeedHref('space-1', 'claims')).toBe('/space/space-1/claims');
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
