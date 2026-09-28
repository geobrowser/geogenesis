import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import type { Relation } from '~/core/types';

import { spaceScopedTypes } from './spaces';

const PROFILE_SPACE = '11111111111111111111111111111111';
const OTHER_SPACE = '22222222222222222222222222222222';
const PERSON_TYPE = '33333333333333333333333333333333';
const SPACE_TYPE = '44444444444444444444444444444444';
const OTHER_TYPE = '55555555555555555555555555555555';

function typeRelation(id: string, spaceId: string, typeId: string, name: string): Relation {
  return {
    id,
    entityId: 'person',
    spaceId,
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    fromEntity: { id: 'person', name: 'Susan Winter' },
    toEntity: { id: typeId, name, value: typeId },
    renderableType: 'RELATION',
  };
}

describe('spaceScopedTypes', () => {
  it('keeps only the viewed space types and removes duplicate relations', () => {
    const relations = [
      typeRelation('profile-person', PROFILE_SPACE, PERSON_TYPE, 'Person'),
      typeRelation('profile-space', PROFILE_SPACE, SPACE_TYPE, 'Space'),
      typeRelation('profile-person-copy', PROFILE_SPACE, PERSON_TYPE, 'Person'),
      typeRelation('other-person', OTHER_SPACE, PERSON_TYPE, 'Person'),
      typeRelation('other-space', OTHER_SPACE, SPACE_TYPE, 'Space'),
      typeRelation('other-only', OTHER_SPACE, OTHER_TYPE, 'Other type'),
    ];

    expect(spaceScopedTypes(relations, PROFILE_SPACE)).toEqual([
      { id: PERSON_TYPE, name: 'Person' },
      { id: SPACE_TYPE, name: 'Space' },
    ]);
  });

  it('ignores deleted type relations and unrelated properties', () => {
    const deleted = { ...typeRelation('deleted', PROFILE_SPACE, PERSON_TYPE, 'Person'), isDeleted: true };
    const unrelated = {
      ...typeRelation('other-property', PROFILE_SPACE, OTHER_TYPE, 'Other type'),
      type: { id: 'not-types', name: 'Not types' },
    };

    expect(spaceScopedTypes([deleted, unrelated], PROFILE_SPACE)).toEqual([]);
  });
});
