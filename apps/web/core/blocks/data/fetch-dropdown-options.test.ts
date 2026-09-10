import { describe, expect, it } from 'vitest';

import {
  decodeDropdownFacet,
  dropdownIdKey,
  fingerprintIdList,
  populationToFromEntityFilter,
} from './fetch-dropdown-options';

describe('dropdownIdKey', () => {
  it('canonicalizes dashed and dashless spellings of one id to the same key', () => {
    expect(dropdownIdKey('591F5D7C-C3FF-48DE-932A-C6F190D21B7B')).toBe('591f5d7cc3ff48de932ac6f190d21b7b');
    expect(dropdownIdKey('591f5d7cc3ff48de932ac6f190d21b7b')).toBe('591f5d7cc3ff48de932ac6f190d21b7b');
  });
});

describe('decodeDropdownFacet', () => {
  it('normalizes group keys and coerces bigint-string counts, sorted count-descending', () => {
    const entries = decodeDropdownFacet({
      relationsConnection: {
        groupedAggregates: [
          { keys: ['AAAA-BBBB'], distinctCount: { fromEntityId: '2' } },
          { keys: ['cccc'], distinctCount: { fromEntityId: '41' } },
        ],
      },
    });
    expect(entries).toEqual([
      { id: 'cccc', count: 41 },
      { id: 'aaaabbbb', count: 2 },
    ]);
  });

  it('breaks count ties by id so the order is stable across refetches', () => {
    const entries = decodeDropdownFacet({
      relationsConnection: {
        groupedAggregates: [
          { keys: ['b'], distinctCount: { fromEntityId: '3' } },
          { keys: ['a'], distinctCount: { fromEntityId: '3' } },
        ],
      },
    });
    expect(entries.map(e => e.id)).toEqual(['a', 'b']);
  });

  it('skips null groups and groups without a key, and defaults a missing count to 0', () => {
    const entries = decodeDropdownFacet({
      relationsConnection: {
        groupedAggregates: [
          null,
          { keys: null, distinctCount: { fromEntityId: '5' } },
          { keys: [], distinctCount: { fromEntityId: '5' } },
          { keys: ['a'], distinctCount: null },
          { keys: ['b'], distinctCount: { fromEntityId: null } },
        ],
      },
    });
    expect(entries).toEqual([
      { id: 'a', count: 0 },
      { id: 'b', count: 0 },
    ]);
  });

  it('handles a null connection or group list', () => {
    expect(decodeDropdownFacet({ relationsConnection: null })).toEqual([]);
    expect(decodeDropdownFacet({ relationsConnection: { groupedAggregates: null } })).toEqual([]);
  });
});

describe('populationToFromEntityFilter', () => {
  it('sends no fromEntity filter for an unfiltered query population', () => {
    expect(populationToFromEntityFilter({ kind: 'query', where: {} })).toBeNull();
  });

  it('converts the where WITHOUT the empty-name exclusion the row queries carry', () => {
    // Deliberate: inside a grouped aggregate the name clause costs ~7x
    // (18.8s vs 2.7s measured on a 60k population) and changed no counts.
    const filter = populationToFromEntityFilter({
      kind: 'query',
      where: { types: [{ id: { equals: 'type-123' } }] },
    });
    expect(filter).toEqual({ typeIds: { anyEqualTo: 'type-123' } });
    expect(JSON.stringify(filter)).not.toContain('"name"');
  });

  it('applies the OR-collapse normalization the row queries get', () => {
    const filter = populationToFromEntityFilter({
      kind: 'query',
      where: { OR: [{ types: [{ id: { equals: 'type-a' } }] }, { types: [{ id: { equals: 'type-b' } }] }] },
    });
    expect(filter).toEqual({ typeIds: { overlaps: ['type-a', 'type-b'] } });
  });

  it('turns an unfiltered ids population into a bare id-in clause', () => {
    expect(populationToFromEntityFilter({ kind: 'ids', ids: ['a', 'b'], where: {} })).toEqual({
      id: { in: ['a', 'b'] },
    });
  });

  it('ANDs a collection membership with its where', () => {
    expect(
      populationToFromEntityFilter({
        kind: 'ids',
        ids: ['a', 'b'],
        where: { types: [{ id: { equals: 'type-123' } }] },
      })
    ).toEqual({
      and: [{ typeIds: { anyEqualTo: 'type-123' } }, { id: { in: ['a', 'b'] } }],
    });
  });
});

describe('fingerprintIdList', () => {
  it('is deterministic and length-prefixed', () => {
    const ids = ['a', 'b', 'c'];
    expect(fingerprintIdList(ids)).toBe(fingerprintIdList(['a', 'b', 'c']));
    expect(fingerprintIdList(ids).startsWith('3:')).toBe(true);
  });

  it('distinguishes order and content', () => {
    expect(fingerprintIdList(['a', 'b'])).not.toBe(fingerprintIdList(['b', 'a']));
    expect(fingerprintIdList(['a', 'b'])).not.toBe(fingerprintIdList(['a', 'c']));
    // The separator keeps boundary shifts distinct: ["ab"] vs ["a","b"].
    expect(fingerprintIdList(['ab'])).not.toBe(fingerprintIdList(['a', 'b']));
  });
});
