import { describe, expect, it } from 'vitest';

import { createTripleId } from './create-id';

describe('create-id', () => {
  it('createTripleId returns correct id derived from triple', () => {
    const entityId = 'entityId';
    const attributeId = 'attributeId';
    expect(createTripleId({ space: 'space', entityId, attributeId })).toBe('space:entityId:attributeId');
  });
});
