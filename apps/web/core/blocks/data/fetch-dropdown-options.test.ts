import { describe, expect, it } from 'vitest';

import {
  DROPDOWN_POPULATION_PAGE_SIZE,
  mergeDropdownOptionCounts,
  populationVariablesForIds,
  populationVariablesFromWhere,
  slicePopulationIds,
  tallyDropdownOptions,
} from './fetch-dropdown-options';

describe('tallyDropdownOptions', () => {
  it('collapses relations to distinct to-entities sorted by name, counting distinct rows', () => {
    const options = tallyDropdownOptions({
      relations: [
        { fromEntityId: 'row-1', toEntity: { id: 'b', name: 'Beta' } },
        { fromEntityId: 'row-1', toEntity: { id: 'a', name: 'Alpha' } },
        { fromEntityId: 'row-2', toEntity: { id: 'b', name: 'Beta' } },
        { fromEntityId: 'row-3', toEntity: null },
      ],
    });
    expect(options).toEqual([
      { id: 'a', name: 'Alpha', count: 1 },
      { id: 'b', name: 'Beta', count: 2 },
    ]);
  });

  it('counts a row once even when it carries duplicate relations to the same value', () => {
    const options = tallyDropdownOptions({
      relations: [
        { fromEntityId: 'row-1', toEntity: { id: 'a', name: 'Alpha' } },
        { fromEntityId: 'row-1', toEntity: { id: 'a', name: 'Alpha' } },
      ],
    });
    expect(options).toEqual([{ id: 'a', name: 'Alpha', count: 1 }]);
  });

  it('keeps a known name when a later relation resolves the same entity without one', () => {
    const options = tallyDropdownOptions({
      relations: [
        { fromEntityId: 'row-1', toEntity: { id: 'a', name: 'Alpha' } },
        { fromEntityId: 'row-2', toEntity: { id: 'a', name: null } },
      ],
    });
    expect(options).toEqual([{ id: 'a', name: 'Alpha', count: 2 }]);
  });

  it('handles an empty or null relation list', () => {
    expect(tallyDropdownOptions({ relations: null })).toEqual([]);
    expect(tallyDropdownOptions({ relations: [] })).toEqual([]);
  });
});

describe('mergeDropdownOptionCounts', () => {
  it('sums counts across disjoint partitions and backfills names', () => {
    const merged = mergeDropdownOptionCounts([
      [
        { id: 'a', name: null, count: 2 },
        { id: 'b', name: 'Beta', count: 1 },
      ],
      [{ id: 'a', name: 'Alpha', count: 3 }],
    ]);
    expect(merged).toEqual([
      { id: 'a', name: 'Alpha', count: 5 },
      { id: 'b', name: 'Beta', count: 1 },
    ]);
  });

  it('leaves a count undefined only when no partition supplied one', () => {
    const merged = mergeDropdownOptionCounts([[{ id: 'a', name: 'Alpha' }], [{ id: 'a', name: 'Alpha', count: 2 }]]);
    expect(merged).toEqual([{ id: 'a', name: 'Alpha', count: 2 }]);
  });
});

describe('populationVariablesFromWhere', () => {
  it('promotes space and type constraints to the top-level connection args', () => {
    const variables = populationVariablesFromWhere(
      {
        AND: [
          { spaces: [{ equals: 'space-1' }] },
          { OR: [{ types: [{ id: { equals: 'type-a' } }] }, { types: [{ id: { equals: 'type-b' } }] }] },
        ],
      },
      200,
      'cursor-1'
    );

    // The single space becomes the indexed `spaceId` arg and leaves the filter.
    expect(variables.spaceId).toBe('space-1');
    expect(variables.spaceIds).toBeNull();
    expect(JSON.stringify(variables.filter)).not.toContain('spaceIds');
    // A multi-type OR is not a plain type clause, so it stays in the filter.
    expect(variables.typeId).toBeNull();
    expect(JSON.stringify(variables.filter)).toContain('typeIds');
    expect(variables.first).toBe(200);
    expect(variables.after).toBe('cursor-1');
  });

  it('sends no filter for an empty where and starts from the beginning', () => {
    expect(populationVariablesFromWhere({}, 50)).toEqual({
      filter: null,
      spaceId: null,
      spaceIds: null,
      typeId: null,
      typeIds: null,
      first: 50,
      after: null,
    });
  });
});

describe('populationVariablesForIds', () => {
  it('joins the id constraint onto the normalized filter and keeps promotion', () => {
    const variables = populationVariablesForIds(['id-1', 'id-2'], {
      AND: [{ spaces: [{ equals: 'space-1' }] }, { types: [{ id: { equals: 'type-a' } }] }],
    });

    expect(variables.spaceId).toBe('space-1');
    expect(variables.typeId).toBe('type-a');
    expect(variables.filter).toMatchObject({ id: { in: ['id-1', 'id-2'] } });
    expect(variables.first).toBe(2);
  });

  it('produces a bare id filter for an empty where', () => {
    const variables = populationVariablesForIds(['id-1'], {});
    expect(variables.filter).toEqual({ id: { in: ['id-1'] } });
    expect(variables.spaceId).toBeNull();
  });
});

describe('slicePopulationIds', () => {
  const ids = Array.from({ length: DROPDOWN_POPULATION_PAGE_SIZE + 5 }, (_, i) => `id-${i}`);

  it('takes the first page from a null cursor and reports more', () => {
    const { slice, endCursor, hasNextPage } = slicePopulationIds(ids, null);
    expect(slice).toHaveLength(DROPDOWN_POPULATION_PAGE_SIZE);
    expect(slice[0]).toBe('id-0');
    expect(endCursor).toBe(String(DROPDOWN_POPULATION_PAGE_SIZE));
    expect(hasNextPage).toBe(true);
  });

  it('resumes from a numeric cursor and ends the walk at the tail', () => {
    const { slice, endCursor, hasNextPage } = slicePopulationIds(ids, String(DROPDOWN_POPULATION_PAGE_SIZE));
    expect(slice).toEqual(['id-1000', 'id-1001', 'id-1002', 'id-1003', 'id-1004']);
    expect(endCursor).toBe(String(ids.length));
    expect(hasNextPage).toBe(false);
  });

  it('returns an empty terminal slice past the end', () => {
    const { slice, hasNextPage } = slicePopulationIds(['a'], '5');
    expect(slice).toEqual([]);
    expect(hasNextPage).toBe(false);
  });
});
