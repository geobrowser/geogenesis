import { describe, expect, it } from 'vitest';

import { populationVariablesFromWhere, toDropdownOptions } from './fetch-dropdown-options';

describe('toDropdownOptions', () => {
  it('collapses relations to distinct to-entities sorted by name', () => {
    const options = toDropdownOptions({
      relations: [
        { toEntity: { id: 'b', name: 'Beta' } },
        { toEntity: { id: 'a', name: 'Alpha' } },
        { toEntity: { id: 'b', name: 'Beta' } },
        { toEntity: null },
      ],
    });
    expect(options).toEqual([
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]);
  });

  it('keeps a known name when a later relation resolves the same entity without one', () => {
    const options = toDropdownOptions({
      relations: [{ toEntity: { id: 'a', name: 'Alpha' } }, { toEntity: { id: 'a', name: null } }],
    });
    expect(options).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  it('handles an empty or null relation list', () => {
    expect(toDropdownOptions({ relations: null })).toEqual([]);
    expect(toDropdownOptions({ relations: [] })).toEqual([]);
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
      200
    );

    // The single space becomes the indexed `spaceId` arg and leaves the filter.
    expect(variables.spaceId).toBe('space-1');
    expect(variables.spaceIds).toBeNull();
    expect(JSON.stringify(variables.filter)).not.toContain('spaceIds');
    // A multi-type OR is not a plain type clause, so it stays in the filter.
    expect(variables.typeId).toBeNull();
    expect(JSON.stringify(variables.filter)).toContain('typeIds');
    expect(variables.first).toBe(200);
  });

  it('sends no filter for an empty where', () => {
    const variables = populationVariablesFromWhere({}, 50);
    expect(variables).toEqual({ filter: null, spaceId: null, spaceIds: null, typeId: null, typeIds: null, first: 50 });
  });
});
