import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { spaceActivityRowsFilter } from './space-activity-rows';
import {
  SPACE_ACTIVITY_LABELS,
  decodeSpaceDebateActivityCounts,
  spaceActivityFeedHref,
  spaceDebateActivityCountsVariables,
} from './space-debate-activity';

describe('spaceActivityFeedHref', () => {
  // The space's own tabs, not a second pair of surfaces beside them. Both are ranked — the debates
  // feed by `useDebatesBestOrder`, the claims tab by `RANKING_SCORE_DESC` — which is what makes
  // them the right end of a "See all" from a card that ranks its six the same way.
  it('points at the space’s own debates and claims tabs', () => {
    expect(spaceActivityFeedHref('space-1', 'debates')).toBe('/space/space-1/debates');
    expect(spaceActivityFeedHref('space-1', 'claims')).toBe('/space/space-1/claims');
  });
});

describe('spaceDebateActivityCountsVariables', () => {
  const SPACE = '41e851610e13a19441c4d980f2f2ce6b';

  /**
   * The whole reason the filter is passed in. Restated, the count and the list drifted on the name
   * requirement — the rows demand one and the count did not — which agreed only because every
   * tagged claim happens to be named. A pill that counts a different corpus from the list it leads
   * to is the bug this closes.
   */
  it('counts claims through the clause the list is filtered by', () => {
    const filter = spaceActivityRowsFilter(SPACE, 'claims');

    expect(spaceDebateActivityCountsVariables(SPACE, filter)).toMatchObject({
      claimsFilter: filter,
      claimTypeIds: { in: [CLAIM_TYPE_ID] },
      spaceIds: { in: [SPACE] },
    });
  });

  it('scopes the debate relation count to this space', () => {
    expect(spaceDebateActivityCountsVariables(SPACE, spaceActivityRowsFilter(SPACE, 'claims'))).toMatchObject({
      spaceIdList: [SPACE],
    });
  });
});

// Three surfaces draw this card; the other two still state these inline, which is how "See all" on
// a space came to read differently from "View all" everywhere else.
describe('SPACE_ACTIVITY_LABELS', () => {
  it('names both kinds and the row that leaves them', () => {
    expect(SPACE_ACTIVITY_LABELS).toEqual({
      debates: { label: 'Debates', seeAllLabel: 'View all debates' },
      claims: { label: 'Claims', seeAllLabel: 'View all claims' },
    });
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

  /**
   * A truncated window cannot be deduplicated, and `totalCount` counts relations — the very
   * duplicates this decoder exists to remove. Reporting it would state a number of the wrong noun
   * about the largest space, where the count matters most, so the answer is that there isn't one.
   */
  it('reports a truncated window as unreadable rather than as the relation total', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: { totalCount: 900, nodes: [{ fromEntityId: 'a' }, { fromEntityId: 'b' }] },
      taggedClaims: { totalCount: 1 },
    });

    expect(counts.debates).toBeNull();
    // The other half is a separate read and is unaffected by it.
    expect(counts.claims).toBe(1);
  });

  // The boundary either side: a window that exactly fills is whole, not truncated.
  it('trusts a window that exactly reaches the total', () => {
    const counts = decodeSpaceDebateActivityCounts({
      debateTypeRelations: { totalCount: 2, nodes: [{ fromEntityId: 'a' }, { fromEntityId: 'b' }] },
      taggedClaims: { totalCount: 0 },
    });

    expect(counts.debates).toBe(2);
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
