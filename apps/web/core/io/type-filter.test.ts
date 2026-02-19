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
});
