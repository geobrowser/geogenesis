import { describe, expect, it } from 'vitest';

import type { ExploreFeedRow } from '~/core/explore/explore-card-item';

import { filterRowsBySpace, sortRows, spaceFacetsFromRows } from './record-client-filter';

/**
 * The Debates tab's controls, which act on a complete array (GEO-2918).
 *
 * Doing this locally is only defensible because the list arrives whole — one
 * request, eleven rows at the top of the graph. The same code on Positions or
 * Proposals would narrow the pages fetched so far, which is a different and
 * wrong answer.
 */
const row = (entityId: string, spaceId: string) => ({ entityId, spaceId }) as ExploreFeedRow;

const ROWS = [row('d1', 'crypto'), row('d2', 'academia'), row('d3', 'crypto')];

describe('spaceFacetsFromRows', () => {
  it('counts the spaces present, most first', () => {
    expect(spaceFacetsFromRows(ROWS)).toEqual([
      { id: 'crypto', count: 2 },
      { id: 'academia', count: 1 },
    ]);
  });

  it('breaks a tie by id so the menu does not reshuffle between renders', () => {
    expect(spaceFacetsFromRows([row('a', 'bbb'), row('b', 'aaa')]).map(facet => facet.id)).toEqual(['aaa', 'bbb']);
  });

  it('has nothing to count for an empty list', () => {
    expect(spaceFacetsFromRows([])).toEqual([]);
  });
});

describe('filterRowsBySpace', () => {
  it('keeps everything when nothing is picked', () => {
    expect(filterRowsBySpace(ROWS, [])).toHaveLength(3);
  });

  it('ORs the selection — a second space can only add', () => {
    expect(filterRowsBySpace(ROWS, ['crypto']).map(r => r.entityId)).toEqual(['d1', 'd3']);
    expect(filterRowsBySpace(ROWS, ['crypto', 'academia'])).toHaveLength(3);
  });

  it('matches however the ids are spelled', () => {
    const dashed = [row('d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')];

    expect(filterRowsBySpace(dashed, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'])).toHaveLength(1);
  });

  it('does not mutate the list it was given', () => {
    const original = [...ROWS];
    filterRowsBySpace(ROWS, ['crypto']);

    expect(ROWS).toEqual(original);
  });
});

describe('sortRows', () => {
  // The rows arrive newest-first from the relation query, and carry no date of
  // their own — a debate's date is on the entity, not the relation this list is
  // built from. So the reverse is the sort.
  it('leaves the incoming order alone for New', () => {
    expect(sortRows(ROWS, 'new').map(r => r.entityId)).toEqual(['d1', 'd2', 'd3']);
  });

  it('reverses it for Oldest', () => {
    expect(sortRows(ROWS, 'oldest').map(r => r.entityId)).toEqual(['d3', 'd2', 'd1']);
  });

  it('does not mutate the list it was given', () => {
    const original = [...ROWS];
    sortRows(ROWS, 'oldest');

    expect(ROWS).toEqual(original);
  });
});
