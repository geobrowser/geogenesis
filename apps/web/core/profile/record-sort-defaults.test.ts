import { describe, expect, it } from 'vitest';

import { DEFAULT_POSITION_SORT } from './person-position-order';
import { DEFAULT_DEBATE_SORT, sortRows } from './record-client-filter';
import { applyFilter } from './use-person-positions';

/**
 * The Activity gallery and the tab it links to are ordered the same way
 * (GEO-2918).
 *
 * The gallery shows the first six of whatever it is handed and offers "See all
 * debates" underneath. Ordered differently from the tab behind that link, the
 * two are separate answers to one question — the reader clicks through expecting
 * more of what they were looking at and gets a different six at the top.
 *
 * Both surfaces read one constant each, so the agreement is structural. This
 * pins what those constants mean, since a wrong value would be a silent change
 * of behaviour on two screens at once rather than a failure anywhere.
 */
const row = (entityId: string) => ({ entityId, spaceId: 's' });

describe('the sort both surfaces open on', () => {
  it('ranks debates, rather than listing them in relation order', () => {
    // Relation order is not a date — it is whatever order the side relations
    // came back in — so a *ranked* default is the point, not which rank.
    expect(DEFAULT_DEBATE_SORT).toBe('best');
  });

  it('actually reorders a list, which is the part that would break silently', () => {
    const rows = [row('d1'), row('d2'), row('d3')];
    const rankings = new Map([
      ['d1', 17_864.4],
      ['d2', 17_901.8],
      ['d3', 17_890.6],
    ]);

    expect(sortRows(rows, DEFAULT_DEBATE_SORT, { rankings }).map(r => r.entityId)).toEqual(['d2', 'd3', 'd1']);
  });

  /**
   * Claims open on New, and New here is the order *this person answered* —
   * `userVotesConnection` ordered `VOTED_AT_DESC` — not the order the claims
   * were written. The two are genuinely different lists: 4 of 10 shared at the
   * top on the reference account.
   */
  it('leaves claims in the order they were answered', () => {
    expect(DEFAULT_POSITION_SORT).toBe('new');
  });

  it('keeps the vote order it was given, unfiltered', () => {
    // `usePersonPositions` defaults to this sort, so the gallery — which asks
    // for no sort at all — gets the tab's order without naming it.
    const order = { entityIds: ['c', 'a', 'b'], responseByClaimId: {}, spacesByClaimId: {} };

    expect(applyFilter(order, null)).toEqual(['c', 'a', 'b']);
  });
});
