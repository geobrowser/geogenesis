import { describe, expect, it } from 'vitest';

import { createValueId } from './create-id';

describe('create-id', () => {
  it('createTripleId returns correct id derived from triple', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    expect(createValueId({ space: 'space', entityId, attributeId })).toBe('space:entityId:attributeId');
  });
});
