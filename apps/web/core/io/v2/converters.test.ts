import { describe, expect, it } from 'vitest';

import { extractTypeIdsFromWhere } from './converters';

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
