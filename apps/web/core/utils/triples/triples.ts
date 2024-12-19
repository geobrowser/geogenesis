import { CreateRelationOp, DeleteRelationOp, DeleteTripleOp, Op, SYSTEM_IDS, SetTripleOp } from '@geogenesis/sdk';

import { Triple as T } from '~/core/database/Triple';
import { StoredRelation, StoredTriple } from '~/core/database/types';
import { ID } from '~/core/id';
import { createTripleId } from '~/core/id/create-id';
import { EntityId } from '~/core/io/schema';
import { Relation, Triple } from '~/core/types';

export function timestamp() {
  return new Date().toISOString();
}

export function merge(local: StoredTriple[], remote: Triple[]): StoredTriple[] {
  const localTripleIds = new Set(local.map(t => t.id));
  const remoteTriplesWithoutLocalTriples = remote.filter(
    t => !localTripleIds.has(createTripleId({ ...t, space: t.space }))
  );
  const remoteTriplesMappedToLocalTriples = remoteTriplesWithoutLocalTriples.map(T.make);

  return [...remoteTriplesMappedToLocalTriples, ...local];
}

export function prepareTriplesForPublishing(triples: Triple[], relations: StoredRelation[], spaceId: string): Op[] {
  const validTriples = triples.filter(
    // Deleted ops have a value of ''. Make sure we don't filter those out
    t => t.space === spaceId && !t.hasBeenPublished && t.attributeId !== '' && t.entityId !== ''
  );

  const validRelations = relations.filter(
    r =>
      r.space === spaceId &&
      !r.hasBeenPublished &&
      r.typeOf.id !== '' &&
      r.fromEntity.id !== '' &&
      r.toEntity.id !== '' &&
      r.index !== ''
  );

  // We store triples for relations locally so that we can render relations as normal
  // entities on an entity page. This also enables us to add arbitrary triples to a
  // relation entity at any point. It helps to have a unified model for reading and writing
  // data for any entity.
  //
  // Here we filter out those relation local triples and only publish the ones that aren't
  // specifically for the required attributes on a relation.
  const triplesForRelations = new Set(getTripleIdsForRelations(validTriples, relations));
  const triplesToPublish = validTriples.filter(t => !triplesForRelations.has(ID.createTripleId(t)));

  const relationOps = validRelations.map((r): CreateRelationOp | DeleteRelationOp => {
    if (r.isDeleted) {
      return {
        type: 'DELETE_RELATION',
        relation: {
          id: r.id,
        },
      };
    }

    return {
      type: 'CREATE_RELATION',
      relation: {
        id: r.id,
        type: r.typeOf.id,
        fromEntity: r.fromEntity.id,
        toEntity: r.toEntity.id,
        index: r.index,
      },
    };
  });

  const tripleOps = triplesToPublish.map((t): SetTripleOp | DeleteTripleOp => {
    if (t.isDeleted) {
      return {
        type: 'DELETE_TRIPLE',
        triple: {
          entity: t.entityId,
          attribute: t.attributeId,
        },
      };
    }

    return {
      type: 'SET_TRIPLE',
      triple: {
        entity: t.entityId,
        attribute: t.attributeId,
        value: {
          type: t.value.type,
          value: t.value.value,
        },
      },
    };
  });

  return [...relationOps, ...tripleOps];
}

const RELATION_ATTRIBUTES = [
  SYSTEM_IDS.TYPES,
  SYSTEM_IDS.RELATION_FROM_ATTRIBUTE,
  SYSTEM_IDS.RELATION_TO_ATTRIBUTE,
  SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE,
  SYSTEM_IDS.RELATION_INDEX,
];

function getTripleIdsForRelations(triples: Triple[], relations: Relation[]): string[] {
  const relationIds = relations.map(r => r.id);

  return triples
    .filter(t => {
      const isForRelationEntity = relationIds.includes(EntityId(t.entityId));

      if (isForRelationEntity && RELATION_ATTRIBUTES.includes(t.attributeId)) {
        return true;
      }

      return false;
    })
    .map(t => ID.createTripleId(t));
}
