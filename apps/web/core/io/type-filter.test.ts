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

  it('strips only the first and-child typeIds when multiple are present', () => {
    const filter: EntityFilter = {
      and: [
        { typeIds: { in: ['type-abc'] } },
        { typeIds: { in: ['type-def'] } },
        { name: { isNull: false, isNot: '' } },
      ],
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({
      and: [{ typeIds: { in: ['type-def'] } }, { name: { isNull: false, isNot: '' } }],
    });
  });

  it('leaves and-children intact when extraction took the top-level typeIds', () => {
    const filter: EntityFilter = {
      typeIds: { in: ['type-abc'] },
      and: [{ typeIds: { in: ['type-def'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(removeTypeIdsFromFilter(filter)).toEqual({
      and: [{ typeIds: { in: ['type-def'] } }, { name: { isNull: false, isNot: '' } }],
    });
  });
});
