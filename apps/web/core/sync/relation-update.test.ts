import { describe, expect, it } from 'vitest';

import { Relation } from '../types';
import { canPublishRelationUpdate } from './relation-update';

const existingRelation: Relation = {
  id: 'existing-relation',
  entityId: 'relation-entity',
  type: { id: 'blocks', name: 'Blocks' },
  fromEntity: { id: 'page', name: 'Page' },
  toEntity: { id: 'block', name: 'Block', value: 'block' },
  renderableType: 'TEXT',
  position: 'a0',
  spaceId: 'space',
};

describe('canPublishRelationUpdate', () => {
  it('updates an existing relation when only its position changes', () => {
    expect(canPublishRelationUpdate(existingRelation, { ...existingRelation, position: 'a1' })).toBe(true);
  });

  it('keeps an unpublished local relation as a create', () => {
    const localRelation = { ...existingRelation, isLocal: true, hasBeenPublished: false };

    expect(canPublishRelationUpdate(localRelation, { ...localRelation, position: 'a1' })).toBe(false);
  });

  it('does not use updateRelation for endpoint changes the SDK cannot update', () => {
    expect(
      canPublishRelationUpdate(existingRelation, {
        ...existingRelation,
        toEntity: { id: 'different-block', name: 'Different block', value: 'different-block' },
      })
    ).toBe(false);
  });
});
