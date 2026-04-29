import { describe, expect, it } from 'vitest';

import { convertWhereConditionToEntityFilter, extractTypeIdsFromWhere } from './converters';

describe('extractTypeIdsFromWhere', () => {
  it('returns undefined when where has no types', () => {
    expect(extractTypeIdsFromWhere({})).toBeUndefined();
  });

  it('returns undefined when types array is empty', () => {
    expect(extractTypeIdsFromWhere({ types: [] })).toBeUndefined();
  });

  it('returns undefined when types have no id.equals', () => {
    expect(extractTypeIdsFromWhere({ types: [{ name: { equals: 'Person' } }] })).toBeUndefined();
  });

  it('returns { is: typeId } for a single type', () => {
    const result = extractTypeIdsFromWhere({
      types: [{ id: { equals: 'type-123' } }],
    });

    expect(result).toEqual({ is: 'type-123' });
  });

  it('returns { in: typeIds } for multiple types', () => {
    const result = extractTypeIdsFromWhere({
      types: [{ id: { equals: 'type-123' } }, { id: { equals: 'type-456' } }],
    });

    expect(result).toEqual({ in: ['type-123', 'type-456'] });
  });

  it('filters out types without id.equals when mixed with valid ones', () => {
    const result = extractTypeIdsFromWhere({
      types: [{ id: { equals: 'type-123' } }, { name: { equals: 'Person' } }, { id: { equals: 'type-456' } }],
    });

    expect(result).toEqual({ in: ['type-123', 'type-456'] });
  });

  it('returns single type filter when only one type has id.equals among multiple', () => {
    const result = extractTypeIdsFromWhere({
      types: [{ name: { equals: 'Person' } }, { id: { equals: 'type-123' } }],
    });

    expect(result).toEqual({ is: 'type-123' });
  });
});

describe('convertWhereConditionToEntityFilter empty-name exclusion', () => {
  it('wraps an empty where in just the empty-name exclusion', () => {
    expect(convertWhereConditionToEntityFilter({})).toEqual({
      name: { isNull: false, isNot: '' },
    });
  });

  it('AND-combines existing filter clauses with the empty-name exclusion', () => {
    const result = convertWhereConditionToEntityFilter({
      name: { startsWith: 'foo' },
    });

    expect(result).toEqual({
      and: [
        { name: { startsWithInsensitive: 'foo' } },
        { name: { isNull: false, isNot: '' } },
      ],
    });
  });

  it('preserves type filtering alongside the empty-name exclusion', () => {
    const result = convertWhereConditionToEntityFilter({
      types: [{ id: { equals: 'type-123' } }],
    });

    expect(result).toEqual({
      and: [
        { typeIds: { anyEqualTo: 'type-123' } },
        { name: { isNull: false, isNot: '' } },
      ],
    });
  });

  it('skips the empty-name exclusion when includeEmptyNames is true', () => {
    expect(convertWhereConditionToEntityFilter({}, { includeEmptyNames: true })).toEqual({});

    expect(
      convertWhereConditionToEntityFilter({ name: { startsWith: 'foo' } }, { includeEmptyNames: true })
    ).toEqual({ name: { startsWithInsensitive: 'foo' } });
  });

  it('does not inject the empty-name exclusion into nested OR/AND/NOT branches', () => {
    const result = convertWhereConditionToEntityFilter({
      OR: [{ name: { startsWith: 'foo' } }, { name: { startsWith: 'bar' } }],
    });

    expect(result).toEqual({
      and: [
        {
          or: [
            { name: { startsWithInsensitive: 'foo' } },
            { name: { startsWithInsensitive: 'bar' } },
          ],
        },
        { name: { isNull: false, isNot: '' } },
      ],
    });
  });
});
