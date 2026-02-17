import { describe, expect, it } from 'vitest';

import type { EntityFilter } from '~/core/gql/graphql';

import { extractSingleSpaceIdFromFilter, extractSpaceIdsFromFilter, removeSpaceIdsFromFilter } from './space-filter';

describe('extractSingleSpaceIdFromFilter', () => {
  it('returns undefined when filter is undefined', () => {
    expect(extractSingleSpaceIdFromFilter(undefined)).toBeUndefined();
  });

  it('returns undefined when filter has no spaceIds', () => {
    expect(extractSingleSpaceIdFromFilter({ name: { is: 'test' } })).toBeUndefined();
  });

  it('returns the space ID for anyEqualTo', () => {
    const filter: EntityFilter = { spaceIds: { anyEqualTo: 'space-abc' } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBe('space-abc');
  });

  it('returns the space ID for a single-element in array', () => {
    const filter: EntityFilter = { spaceIds: { in: ['space-abc'] } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBe('space-abc');
  });

  it('returns undefined for a multi-element in array', () => {
    const filter: EntityFilter = { spaceIds: { in: ['space-abc', 'space-def'] } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for an empty in array', () => {
    const filter: EntityFilter = { spaceIds: { in: [] } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for a single-element in array with null value', () => {
    const filter: EntityFilter = { spaceIds: { in: [null] } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for unhandled operators like overlaps', () => {
    const filter: EntityFilter = { spaceIds: { containedBy: ['space-abc'] } };
    expect(extractSingleSpaceIdFromFilter(filter)).toBeUndefined();
  });
});

describe('extractSpaceIdsFromFilter', () => {
  it('returns undefined when filter is undefined', () => {
    expect(extractSpaceIdsFromFilter(undefined)).toBeUndefined();
  });

  it('returns undefined when filter has no spaceIds', () => {
    expect(extractSpaceIdsFromFilter({ name: { is: 'test' } })).toBeUndefined();
  });

  it('returns { in: [...] } for a multi-element in array', () => {
    const filter: EntityFilter = { spaceIds: { in: ['space-abc', 'space-def'] } };
    expect(extractSpaceIdsFromFilter(filter)).toEqual({ in: ['space-abc', 'space-def'] });
  });

  it('filters out null values from in array', () => {
    const filter: EntityFilter = { spaceIds: { in: ['space-abc', null, 'space-def'] } };
    expect(extractSpaceIdsFromFilter(filter)).toEqual({ in: ['space-abc', 'space-def'] });
  });

  it('returns undefined for a single-element in array (handled by extractSingleSpaceIdFromFilter)', () => {
    const filter: EntityFilter = { spaceIds: { in: ['space-abc'] } };
    expect(extractSpaceIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined for an empty in array', () => {
    const filter: EntityFilter = { spaceIds: { in: [] } };
    expect(extractSpaceIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns { is: spaceId } for anyEqualTo', () => {
    const filter: EntityFilter = { spaceIds: { anyEqualTo: 'space-abc' } };
    expect(extractSpaceIdsFromFilter(filter)).toEqual({ is: 'space-abc' });
  });

  it('returns undefined for unhandled operators', () => {
    const filter: EntityFilter = { spaceIds: { anyNotEqualTo: 'space-abc' } };
    expect(extractSpaceIdsFromFilter(filter)).toBeUndefined();
  });

  it('returns undefined when multi-element in array contains only nulls', () => {
    const filter: EntityFilter = { spaceIds: { in: [null, null] } };
    expect(extractSpaceIdsFromFilter(filter)).toBeUndefined();
  });
});

describe('removeSpaceIdsFromFilter', () => {
  it('returns the filter unchanged when it has no spaceIds', () => {
    const filter: EntityFilter = { name: { is: 'test' } };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({ name: { is: 'test' } });
  });

  it('returns undefined when filter is undefined', () => {
    expect(removeSpaceIdsFromFilter(undefined)).toBeUndefined();
  });

  it('removes spaceIds and returns remaining filter keys', () => {
    const filter: EntityFilter = {
      spaceIds: { anyEqualTo: 'space-abc' },
      name: { is: 'test' },
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({ name: { is: 'test' } });
  });

  it('returns undefined when spaceIds is the only key', () => {
    const filter: EntityFilter = { spaceIds: { anyEqualTo: 'space-abc' } };
    expect(removeSpaceIdsFromFilter(filter)).toBeUndefined();
  });

  it('preserves all non-spaceIds filter keys', () => {
    const filter: EntityFilter = {
      spaceIds: { in: ['space-abc'] },
      name: { is: 'test' },
      id: { is: 'entity-123' },
    };
    const result = removeSpaceIdsFromFilter(filter);
    expect(result).toEqual({ name: { is: 'test' }, id: { is: 'entity-123' } });
    expect(result).not.toHaveProperty('spaceIds');
  });
});
