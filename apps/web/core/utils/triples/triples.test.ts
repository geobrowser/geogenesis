import { Relation } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import { Triple } from '~/core/database/Triple';
import { StoredRelation } from '~/core/database/types';
import { EntityId } from '~/core/io/schema';

import { prepareTriplesForPublishing } from './triples';

const TRIPLE = Triple.make({
  attributeId: 'test-attribute',
  attributeName: 'test-attribute-name',
  entityId: 'test-entity',
  entityName: 'test-entity-name',
  space: 'test-space',
  value: {
    type: 'TEXT',
    value: 'test value',
  },
});

const RELATION: StoredRelation = {
  fromEntity: {
    id: EntityId('1234'),
    name: null,
  },
  id: EntityId('1234'),
  index: '1234',
  space: 'test-space',
  toEntity: {
    id: EntityId('1234'),
    name: null,
    renderableType: 'DATA',
    value: EntityId('1234'),
  },
  typeOf: {
    id: EntityId('1234'),
    name: null,
  },
};

describe('prepareTriplesForPublishing', () => {
  it('maps created data to create ops', () => {
    const { opsToPublish } = prepareTriplesForPublishing([TRIPLE], [RELATION], TRIPLE.space);

    expect(opsToPublish).toEqual([
      Relation.make({
        relationId: RELATION.id,
        fromId: RELATION.fromEntity.id,
        relationTypeId: RELATION.typeOf.id,
        toId: RELATION.toEntity.id,
        position: RELATION.index,
      }),
      {
        type: 'SET_TRIPLE',
        triple: {
          entity: TRIPLE.entityId,
          attribute: TRIPLE.attributeId,
          value: {
            type: TRIPLE.value.type,
            value: TRIPLE.value.value,
          },
        },
      },
    ]);
  });

  it('maps deleted data to delete ops', () => {
    const { opsToPublish } = prepareTriplesForPublishing(
      [{ ...TRIPLE, isDeleted: true }],
      [{ ...RELATION, isDeleted: true }],
      TRIPLE.space
    );
    expect(opsToPublish).toEqual([
      {
        type: 'DELETE_RELATION',
        relation: {
          id: RELATION.id,
        },
      },
      {
        type: 'DELETE_TRIPLE',
        triple: {
          entity: TRIPLE.entityId,
          attribute: TRIPLE.attributeId,
        },
      },
    ]);
  });

  it('filters ops from different space', () => {
    const { opsToPublish: result } = prepareTriplesForPublishing([TRIPLE], [RELATION], 'different test space');
    expect(result.length).toEqual(0);
  });

  it('filters already-published ops', () => {
    const { opsToPublish: result } = prepareTriplesForPublishing(
      [{ ...TRIPLE, hasBeenPublished: true }],
      [{ ...RELATION, hasBeenPublished: true }],
      TRIPLE.space
    );
    expect(result.length).toEqual(0);
  });

  it('filters invalid ops where entity id is empty', () => {
    const { opsToPublish: result } = prepareTriplesForPublishing(
      [{ ...TRIPLE, entityId: '' }],
      [{ ...RELATION, fromEntity: { id: EntityId(''), name: null } }],
      TRIPLE.space
    );
    expect(result.length).toEqual(0);
  });

  it('filters invalid ops with empty attribute id', () => {
    const { opsToPublish: result } = prepareTriplesForPublishing(
      [{ ...TRIPLE, attributeId: '' }],
      [{ ...RELATION, typeOf: { id: EntityId(''), name: null } }],
      TRIPLE.space
    );
    expect(result.length).toEqual(0);
  });

  it('filters invalid ops with empty relation to entity id', () => {
    const { opsToPublish: result } = prepareTriplesForPublishing(
      [],
      [{ ...RELATION, toEntity: { id: EntityId(''), name: null, renderableType: 'DATA', value: EntityId('') } }],
      TRIPLE.space
    );
    expect(result.length).toEqual(0);
  });
});
