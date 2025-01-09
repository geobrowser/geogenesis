import { describe, expect, it } from 'vitest';

import { createTripleId } from './create-id';

describe('create-id', () => {
  it('createTripleId returns correct id derived from triple with string value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    expect(createTripleId({ space: 'space', entityId, attributeId })).toBe('space:entityId:attributeId:valueId');
  });

  it('createTripleId returns correct id derived from triple with number value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    expect(createTripleId({ space: 'space', entityId, attributeId })).toBe('space:entityId:attributeId:valueId');
  });

  it('createTripleId returns correct id derived from triple with entity value', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    expect(createTripleId({ space: 'space', entityId, attributeId })).toBe('space:entityId:attributeId:12387');
  });
});
