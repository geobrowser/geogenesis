import { describe, expect, it } from 'vitest';

import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { EntitiesOrderBy } from '~/core/gql/graphql';

import {
  builtInSortOrderBy,
  nextSortDirection,
  shouldIncludeWithoutValueForPropertySort,
  sortStateLabel,
} from './column-sort';

describe('shouldIncludeWithoutValueForPropertySort', () => {
  it('includes entities without a value when sorting by score', () => {
    expect(shouldIncludeWithoutValueForPropertySort(SCORE_SYSTEM_PROPERTY)).toBe(true);
  });

  it('does not include missing values for other property sorts', () => {
    expect(shouldIncludeWithoutValueForPropertySort('other-property')).toBe(false);
  });
});

describe('builtInSortOrderBy', () => {
  it('orders Best by ranking score with stable tiebreaks', () => {
    expect(builtInSortOrderBy({ kind: 'builtin', sort: 'best', direction: 'desc' })).toEqual([
      EntitiesOrderBy.RankingScoreDesc,
      EntitiesOrderBy.UpdatedAtDesc,
      EntitiesOrderBy.IdAsc,
    ]);
    expect(builtInSortOrderBy({ kind: 'builtin', sort: 'best', direction: 'asc' })).toEqual([
      EntitiesOrderBy.RankingScoreAsc,
      EntitiesOrderBy.UpdatedAtAsc,
      EntitiesOrderBy.IdAsc,
    ]);
  });

  it('orders Created by creation time with an id tiebreak', () => {
    expect(builtInSortOrderBy({ kind: 'builtin', sort: 'created_at', direction: 'desc' })).toEqual([
      EntitiesOrderBy.CreatedAtDesc,
      EntitiesOrderBy.IdAsc,
    ]);
    expect(builtInSortOrderBy({ kind: 'builtin', sort: 'created_at', direction: 'asc' })).toEqual([
      EntitiesOrderBy.CreatedAtAsc,
      EntitiesOrderBy.IdAsc,
    ]);
  });
});

describe('nextSortDirection', () => {
  it('cycles a column through ascending, descending, none', () => {
    const asc = nextSortDirection(null, 'col');
    expect(asc).toEqual({ kind: 'property', columnId: 'col', direction: 'asc' });
    const desc = nextSortDirection(asc, 'col');
    expect(desc).toEqual({ kind: 'property', columnId: 'col', direction: 'desc' });
    expect(nextSortDirection(desc, 'col')).toBeNull();
  });

  it('starts ascending on a column when a built-in sort is active', () => {
    expect(nextSortDirection({ kind: 'builtin', sort: 'best', direction: 'desc' }, 'col')).toEqual({
      kind: 'property',
      columnId: 'col',
      direction: 'asc',
    });
  });
});

describe('sortStateLabel', () => {
  it('names built-in sorts', () => {
    expect(sortStateLabel({ kind: 'builtin', sort: 'best', direction: 'desc' }, [])).toBe('Best');
    expect(sortStateLabel({ kind: 'builtin', sort: 'created_at', direction: 'desc' }, [])).toBe('Created');
  });

  it('names property sorts from the property list, then the defaults, then the id', () => {
    expect(
      sortStateLabel({ kind: 'property', columnId: 'p1', direction: 'asc' }, [
        { id: 'p1', name: 'Founded', dataType: 'DATE' },
      ])
    ).toBe('Founded');
    expect(sortStateLabel({ kind: 'property', columnId: SCORE_SYSTEM_PROPERTY, direction: 'asc' }, [])).toBe('Score');
    expect(sortStateLabel({ kind: 'property', columnId: 'missing', direction: 'asc' }, [])).toBe('missing');
  });
});
