import { describe, expect, it } from 'vitest';

import type { EntityFilter } from '~/core/gql/graphql';

import { extractSingleTypeIdFromFilter, extractTypeIdsFromFilter, removeTypeIdsFromFilter } from './type-filter';

describe('extractSingleTypeIdFromFilter', () => {
  it('returns undefined when filter is undefined', () => {
    expect(extractSingleTypeIdFromFilter(undefined)).toBeUndefined();
  });

  it('returns undefined when filter has no typeIds', () => {
    expect(extractSingleTypeIdFromFilter({ name: { is: 'test' } })).toBeUndefined();
  });

  it('returns the type ID for anyEqualTo', () => {
    const filter: EntityFilter = { typeIds: { anyEqualTo: 'type-abc' } };
    expect(extractSingleTypeIdFromFilter(filter)).toBe('type-abc');
  });

  it('returns the type ID for a single-element in array', () => {
    const filter: EntityFilter = { typeIds: { in: ['type-abc'] } };
    expect(extractSingleTypeIdFromFilter(filter)).toBe('type-abc');
  });

  it('returns undefined for a multi-element in array', () => {
    const filter: EntityFilter = { typeIds: { in: ['type-abc', 'type-def'] } };
    expect(extractSingleTypeIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for an empty in array', () => {
    const filter: EntityFilter = { typeIds: { in: [] } };
    expect(extractSingleTypeIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for a single-element in array with null value', () => {
    const filter: EntityFilter = { typeIds: { in: [null] } };
    expect(extractSingleTypeIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for unhandled operators like overlaps', () => {
    const filter: EntityFilter = { typeIds: { containedBy: ['type-abc'] } };
    expect(extractSingleTypeIdFromFilter(filter)).toBeUndefined();
  });

  it('finds typeIds inside a top-level and array (empty-name wrap shape)', () => {
    const filter: EntityFilter = {
      and: [{ typeIds: { in: ['type-abc'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractSingleTypeIdFromFilter(filter)).toBe('type-abc');
  });
});

describe('extractTypeIdsFromFilter', () => {
  it('returns undefined when filter is undefined', () => {
    expect(extractTypeIdsFromFilter(undefined)).toBeUndefined();
  });

  it('returns undefined when filter has no typeIds', () => {
    expect(extractTypeIdsFromFilter({ name: { is: 'test' } })).toBeUndefined();
  });

  it('returns { in: [...] } for a multi-element in array', () => {
    const filter: EntityFilter = { typeIds: { in: ['type-abc', 'type-def'] } };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: ['type-abc', 'type-def'] });
  });

  it('filters out null values from in array', () => {
    const filter: EntityFilter = { typeIds: { in: ['type-abc', null, 'type-def'] } };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: ['type-abc', 'type-def'] });
  });

  it('returns undefined for a single-element in array (handled by extractSingleTypeIdFromFilter)', () => {
    const filter: EntityFilter = { typeIds: { in: ['type-abc'] } };
    expect(extractTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for an empty in array', () => {
    const filter: EntityFilter = { typeIds: { in: [] } };
    expect(extractTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns { is: typeId } for anyEqualTo', () => {
    const filter: EntityFilter = { typeIds: { anyEqualTo: 'type-abc' } };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ is: 'type-abc' });
  });

  it('returns undefined for unhandled operators', () => {
    const filter: EntityFilter = { typeIds: { anyNotEqualTo: 'type-abc' } };
    expect(extractTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined when multi-element in array contains only nulls', () => {
    const filter: EntityFilter = { typeIds: { in: [null, null] } };
    expect(extractTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('finds multi-element typeIds inside a top-level and array', () => {
    const filter: EntityFilter = {
      and: [{ typeIds: { in: ['type-abc', 'type-def'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: ['type-abc', 'type-def'] });
  });
});

describe('removeTypeIdsFromFilter', () => {
  it('returns the filter unchanged when it has no typeIds', () => {
    const filter: EntityFilter = { name: { is: 'test' } };
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { is: 'test' } });
  });

  it('returns undefined when filter is undefined', () => {
    expect(removeTypeIdsFromFilter(undefined)).toBeUndefined();
  });

  it('removes typeIds and returns remaining filter keys', () => {
    const filter: EntityFilter = {
      typeIds: { anyEqualTo: 'type-abc' },
      name: { is: 'test' },
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { is: 'test' } });
  });

  it('returns undefined when typeIds is the only key', () => {
    const filter: EntityFilter = { typeIds: { anyEqualTo: 'type-abc' } };
    expect(removeTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('preserves all non-typeIds filter keys', () => {
    const filter: EntityFilter = {
      typeIds: { in: ['type-abc'] },
      name: { is: 'test' },
      id: { is: 'entity-123' },
    };
    const result = removeTypeIdsFromFilter(filter);
    expect(result).toEqual({ name: { is: 'test' }, id: { is: 'entity-123' } });
    expect(result).not.toHaveProperty('typeIds');
  });

  it('removes typeIds buried in a top-level and (empty-name wrap) and hoists the remaining sibling', () => {
    const filter: EntityFilter = {
      and: [{ typeIds: { in: ['type-abc'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { isNull: false, isNot: '' } });
  });

  it('returns undefined when stripping typeIds from an and leaves nothing', () => {
    const filter: EntityFilter = { and: [{ typeIds: { in: ['type-abc'] } }] };
    expect(removeTypeIdsFromFilter(filter)).toBeUndefined();
  });

  it('keeps the and-wrap when the lone remaining sibling collides with a top-level key', () => {
    // Both top-level and the post-strip singleton carry `name` — hoisting would
    // silently drop one. The wrap must be preserved so both clauses survive.
    const filter: EntityFilter = {
      name: { is: 'top' },
      and: [{ typeIds: { in: ['type-abc'] }, name: { is: 'inner' } }],
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({
      name: { is: 'top' },
      and: [{ name: { is: 'inner' } }],
    });
  });

  it('keeps the and-wrap when more than one sibling remains after stripping', () => {
    const filter: EntityFilter = {
      and: [{ typeIds: { in: ['type-abc'] } }, { name: { isNull: false, isNot: '' } }, { id: { is: 'entity-123' } }],
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({
      and: [{ name: { isNull: false, isNot: '' } }, { id: { is: 'entity-123' } }],
    });
  });

  /* These two asserted the old strip-the-first-only contract. Extraction now promotes *every*
     type clause as one any-of set, so removal must take every one of them: a leftover `typeIds`
     is AND-ed against the promoted set and silently re-narrows the result to that type. */
  it('strips every and-child typeIds, not just the first', () => {
    const filter: EntityFilter = {
      and: [
        { typeIds: { in: ['type-abc'] } },
        { typeIds: { in: ['type-def'] } },
        { name: { isNull: false, isNot: '' } },
      ],
    };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: ['type-abc', 'type-def'] });
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { isNull: false, isNot: '' } });
  });

  it('strips and-children too when a top-level typeIds is also present', () => {
    const filter: EntityFilter = {
      typeIds: { in: ['type-abc'] },
      and: [{ typeIds: { in: ['type-def'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: ['type-abc', 'type-def'] });
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { isNull: false, isNot: '' } });
  });
});

describe('overlaps promotion (GEO-2739)', () => {
  const T1 = '5ef5a5860f274d8e8f6c59ae5b3e89e2';
  const T2 = 'c7a4fc6d1afc53250a22d4209391dc79';

  it('promotes overlaps to the indexed top-level argument as `in`', () => {
    // `in` is correct *here* and wrong inside the filter: the top-level `typeIds` argument is a
    // UuidFilter over the set, not a filter on the list column. That difference is the whole
    // 2,151 ms -> 750 ms.
    expect(extractTypeIdsFromFilter({ typeIds: { overlaps: [T1, T2] } })).toEqual({ in: [T1, T2] });
  });

  it('promotes a single-valued overlaps as `is`', () => {
    expect(extractTypeIdsFromFilter({ typeIds: { overlaps: [T1] } })).toEqual({ is: T1 });
    expect(extractSingleTypeIdFromFilter({ typeIds: { overlaps: [T1] } })).toEqual(T1);
  });

  it('finds an overlaps clause buried one level deep in `and`', () => {
    const filter = { and: [{ typeIds: { overlaps: [T1, T2] } }, { name: { isNot: '' } }] };
    expect(extractTypeIdsFromFilter(filter)).toEqual({ in: [T1, T2] });
  });

  it('strips the promoted clause so it is not also scanned as a predicate', () => {
    const filter = { and: [{ typeIds: { overlaps: [T1, T2] } }, { name: { isNot: '' } }] };
    expect(removeTypeIdsFromFilter(filter)).toEqual({ name: { isNot: '' } });
  });
});

describe("explore's nested type filter (the 30s timeout)", () => {
  // The exact filter production sent, from a `Slow GraphQL query` log line whose
  // durationMs was 30,023 and responseSizeBytes 27 — an error body, not data.
  const exploreFilter: EntityFilter = {
    and: [
      {
        and: [
          { typeIds: { anyEqualTo: 'topic' } },
          { typeIds: { anyEqualTo: 'person' } },
          { typeIds: { anyEqualTo: 'third' } },
        ],
      },
      { name: { isNull: false, isNot: '' } },
    ],
  };

  it('promotes every type out of the nested and, as one any-of set', () => {
    expect(extractTypeIdsFromFilter(exploreFilter)).toEqual({ in: ['topic', 'person', 'third'] });
  });

  it('is not mistaken for a single-type filter', () => {
    expect(extractSingleTypeIdFromFilter(exploreFilter)).toBeUndefined();
  });

  it('leaves nothing behind that would rebuild an EXISTS', () => {
    const stripped = removeTypeIdsFromFilter(exploreFilter);
    expect(JSON.stringify(stripped)).not.toContain('typeIds');
    // and the surviving name clause is inlined rather than left wrapped in a one-element `and`
    expect(stripped).toEqual({ name: { isNull: false, isNot: '' } });
  });

  it('de-duplicates a type named twice', () => {
    const f: EntityFilter = { and: [{ and: [{ typeIds: { anyEqualTo: 'a' } }, { typeIds: { in: ['a', 'b'] } }] }] };
    expect(extractTypeIdsFromFilter(f)).toEqual({ in: ['a', 'b'] });
  });

  it('still promotes a single nested type as `is`, not `in`', () => {
    const f: EntityFilter = { and: [{ and: [{ typeIds: { anyEqualTo: 'only' } }] }, { name: { isNot: '' } }] };
    expect(extractTypeIdsFromFilter(f)).toEqual({ is: 'only' });
    expect(extractSingleTypeIdFromFilter(f)).toBe('only');
  });
});
