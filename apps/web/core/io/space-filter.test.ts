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

  it('finds spaceIds inside a top-level and array (empty-name wrap shape)', () => {
    const filter: EntityFilter = {
      and: [{ spaceIds: { in: ['space-abc'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractSingleSpaceIdFromFilter(filter)).toBe('space-abc');
  });

  it('finds spaceIds with anyEqualTo inside a top-level and array', () => {
    const filter: EntityFilter = {
      and: [{ spaceIds: { anyEqualTo: 'space-abc' } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractSingleSpaceIdFromFilter(filter)).toBe('space-abc');
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

  it('finds multi-element spaceIds inside a top-level and array', () => {
    const filter: EntityFilter = {
      and: [{ spaceIds: { in: ['space-abc', 'space-def'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(extractSpaceIdsFromFilter(filter)).toEqual({ in: ['space-abc', 'space-def'] });
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

  it('removes spaceIds buried in a top-level and (empty-name wrap) and hoists the remaining sibling', () => {
    const filter: EntityFilter = {
      and: [{ spaceIds: { in: ['space-abc'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({ name: { isNull: false, isNot: '' } });
  });

  it('returns undefined when stripping spaceIds from an and leaves nothing', () => {
    const filter: EntityFilter = {
      and: [{ spaceIds: { in: ['space-abc'] } }],
    };
    expect(removeSpaceIdsFromFilter(filter)).toBeUndefined();
  });

  it('keeps the and-wrap when the lone remaining sibling collides with a top-level key', () => {
    // Both top-level and the post-strip singleton carry `name` — hoisting would
    // silently drop one. The wrap must be preserved so both clauses survive.
    const filter: EntityFilter = {
      name: { is: 'top' },
      and: [{ spaceIds: { in: ['space-abc'] }, name: { is: 'inner' } }],
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({
      name: { is: 'top' },
      and: [{ name: { is: 'inner' } }],
    });
  });

  it('keeps the and-wrap when more than one sibling remains after stripping', () => {
    const filter: EntityFilter = {
      and: [
        { spaceIds: { in: ['space-abc'] } },
        { name: { isNull: false, isNot: '' } },
        { id: { is: 'entity-123' } },
      ],
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({
      and: [{ name: { isNull: false, isNot: '' } }, { id: { is: 'entity-123' } }],
    });
  });

  it('strips only the first and-child spaceIds when multiple are present', () => {
    // Mirrors extractor's first-wins semantics: only the clause that gets
    // promoted is removed. Later spaceIds clauses represent independent
    // constraints and must survive on the residual filter so the server
    // still enforces them. A previous version stripped every match,
    // silently broadening results.
    const filter: EntityFilter = {
      and: [
        { spaceIds: { in: ['space-abc'] } },
        { spaceIds: { in: ['space-def'] } },
        { name: { isNull: false, isNot: '' } },
      ],
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({
      and: [{ spaceIds: { in: ['space-def'] } }, { name: { isNull: false, isNot: '' } }],
    });
  });

  it('leaves and-children intact when extraction took the top-level spaceIds', () => {
    // Top-level wins during extraction, so the and-array is left untouched
    // — any nested spaceIds is an independent constraint, not a duplicate
    // of the promoted clause.
    const filter: EntityFilter = {
      spaceIds: { in: ['space-abc'] },
      and: [{ spaceIds: { in: ['space-def'] } }, { name: { isNull: false, isNot: '' } }],
    };
    expect(removeSpaceIdsFromFilter(filter)).toEqual({
      and: [{ spaceIds: { in: ['space-def'] } }, { name: { isNull: false, isNot: '' } }],
    });
  });
});
