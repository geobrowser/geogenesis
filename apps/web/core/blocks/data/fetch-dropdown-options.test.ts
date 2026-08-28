import { describe, expect, it } from 'vitest';

import { spaceIdsFromWhere, toDropdownOptions } from './fetch-dropdown-options';

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

describe('spaceIdsFromWhere', () => {
  it('returns undefined for an unscoped block', () => {
    expect(spaceIdsFromWhere({})).toBeUndefined();
    expect(spaceIdsFromWhere({ types: [{ id: { equals: 'type-a' } }] })).toBeUndefined();
  });

  it('uses `is` for one space and `in` for several, wherever they sit in the tree', () => {
    expect(spaceIdsFromWhere({ spaces: [{ equals: 'space-1' }] })).toEqual({ is: 'space-1' });
    expect(
      spaceIdsFromWhere({
        AND: [
          { spaces: [{ equals: 'space-1' }, { equals: 'space-2' }] },
          { OR: [{ types: [{ id: { equals: 'type-a' } }] }, { spaces: [{ equals: 'space-3' }] }] },
        ],
      })
    ).toEqual({ in: ['space-1', 'space-2', 'space-3'] });
  });
});
