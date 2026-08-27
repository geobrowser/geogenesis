import { describe, expect, it } from 'vitest';

import { Relation } from '../types';
import {
  getRelationUpdateUnsetFields,
  isExistingRelationWithUnchangedIdentity,
  requiresRelationIdentityReplacement,
} from './relation-update';

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

describe('isExistingRelationWithUnchangedIdentity', () => {
  it('preserves an existing relation when its identity fields are unchanged', () => {
    expect(isExistingRelationWithUnchangedIdentity(existingRelation, { ...existingRelation, position: 'a1' })).toBe(
      true
    );
  });

  it('does not imply that non-identity fields are publishable', () => {
    expect(isExistingRelationWithUnchangedIdentity(existingRelation, { ...existingRelation, verified: true })).toBe(
      true
    );
  });

  it('keeps an unpublished local relation as a create', () => {
    const localRelation = { ...existingRelation, isLocal: true, hasBeenPublished: false };

    expect(isExistingRelationWithUnchangedIdentity(localRelation, { ...localRelation, position: 'a1' })).toBe(false);
  });

  it('does not use updateRelation for endpoint changes the SDK cannot update', () => {
    expect(
      isExistingRelationWithUnchangedIdentity(existingRelation, {
        ...existingRelation,
        toEntity: { id: 'different-block', name: 'Different block', value: 'different-block' },
      })
    ).toBe(false);
  });
});

describe('requiresRelationIdentityReplacement', () => {
  it('replaces an existing relation when an endpoint changes', () => {
    expect(
      requiresRelationIdentityReplacement(existingRelation, {
        ...existingRelation,
        fromEntity: { id: 'different-page', name: 'Different page' },
      })
    ).toBe(true);
  });

  it('allows an unpublished relation identity to change before its first create', () => {
    const localRelation = { ...existingRelation, isLocal: true, hasBeenPublished: false };

    expect(
      requiresRelationIdentityReplacement(localRelation, {
        ...localRelation,
        fromEntity: { id: 'different-page', name: 'Different page' },
      })
    ).toBe(false);
  });

  it('keeps position-only changes on the existing relation', () => {
    expect(requiresRelationIdentityReplacement(existingRelation, { ...existingRelation, position: 'a1' })).toBe(
      false
    );
  });
});

describe('getRelationUpdateUnsetFields', () => {
  it('explicitly unsets a removed to-space reference', () => {
    const relationWithSpace = { ...existingRelation, toSpaceId: 'target-space' };

    expect(getRelationUpdateUnsetFields(relationWithSpace, { ...relationWithSpace, toSpaceId: undefined })).toEqual([
      'toSpace',
    ]);
  });

  it('preserves a pending unset until a to-space reference is selected again', () => {
    const pendingUnset = {
      ...existingRelation,
      relationUpdateUnsetFields: ['toSpace'] as Array<'toSpace'>,
    };

    expect(getRelationUpdateUnsetFields(pendingUnset, pendingUnset)).toEqual(['toSpace']);
    expect(getRelationUpdateUnsetFields(pendingUnset, { ...pendingUnset, toSpaceId: 'target-space' })).toEqual([]);
  });
});
