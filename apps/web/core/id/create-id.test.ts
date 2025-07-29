import { describe, expect, it } from 'vitest';

import { createValueId } from './create-id';

describe('createValueId', () => {
  it('should create a value ID with the correct format', () => {
    const result = createValueId({
      spaceId: 'space123',
      entityId: 'entity456',
      propertyId: 'prop789',
    });

    expect(result).toBe('space123:entity456:prop789');
  });

  it('should handle empty strings', () => {
    const result = createValueId({
      spaceId: '',
      entityId: '',
      propertyId: '',
    });

    expect(result).toBe('::');
  });

  it('should handle IDs with special characters', () => {
    const result = createValueId({
      spaceId: 'space-with-dashes_and_underscores',
      entityId: 'entity/with/slashes',
      propertyId: 'prop.with.dots',
    });

    expect(result).toBe('space-with-dashes_and_underscores:entity/with/slashes:prop.with.dots');
  });

  it('should handle numeric string IDs', () => {
    const result = createValueId({
      spaceId: '12345',
      entityId: '67890',
      propertyId: '54321',
    });

    expect(result).toBe('12345:67890:54321');
  });

  it('should handle UUIDs as IDs', () => {
    const result = createValueId({
      spaceId: '550e8400-e29b-41d4-a716-446655440000',
      entityId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      propertyId: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
    });

    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000:6ba7b810-9dad-11d1-80b4-00c04fd430c8:6ba7b811-9dad-11d1-80b4-00c04fd430c8');
  });

  it('should handle IDs containing colons', () => {
    const result = createValueId({
      spaceId: 'space:with:colons',
      entityId: 'entity:id',
      propertyId: 'property:name',
    });

    expect(result).toBe('space:with:colons:entity:id:property:name');
  });

  it('should maintain the correct order: spaceId:entityId:propertyId', () => {
    const result = createValueId({
      spaceId: 'A',
      entityId: 'B',
      propertyId: 'C',
    });

    expect(result).toBe('A:B:C');
  });

  it('should handle long ID strings', () => {
    const longId = 'a'.repeat(100);
    const result = createValueId({
      spaceId: longId,
      entityId: longId,
      propertyId: longId,
    });

    expect(result).toBe(`${longId}:${longId}:${longId}`);
    expect(result.length).toBe(302); // 100 + 1 + 100 + 1 + 100
  });
});
