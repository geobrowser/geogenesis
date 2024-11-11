import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { Versions } from '../db';
import { Relations } from '../db/relations';
import type { Op } from '../types';

type RelationWithEntities = {
  to: string;
  from: string;
  typeOf: string;
  entityId: string;
  index?: string;
};

export function maybeEntityOpsToRelation(ops: Op[], entityId: string): RelationWithEntities | null {
  // Grab other triples in this edit that match the relation's entity id. We
  // want to add all of the relation properties to the item in the
  // collection_items table.
  const setTriples = ops.filter(t => t.type === 'SET_TRIPLE');

  const isRelation = setTriples.find(
    t =>
      t.triple.attribute === SYSTEM_IDS.TYPES &&
      t.triple.value.type === 'ENTITY' &&
      t.triple.value.value === SYSTEM_IDS.RELATION_TYPE
  );
  const to = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_TO_ATTRIBUTE && t.triple.value.type === 'ENTITY'
  );
  const from = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE && t.triple.value.type === 'ENTITY'
  );
  const type = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE && t.triple.value.type === 'ENTITY'
  );
  const index = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_INDEX && t.triple.value.type === 'TEXT'
  );

  if (!isRelation) {
    return null;
  }

  if (!to || !from || !type) {
    return null;
  }

  return {
    to: to.triple.value.value,
    from: from.triple.value.value,
    entityId: entityId,
    typeOf: type.triple.value.value,
    index: index?.triple.value.value,
  };
}

export function getStaleEntitiesInEdit(args: {
  createdRelations: RelationWithEntities[];
  deletedRelations: string[];
  entityIds: Set<string>;
}) {
  const { createdRelations, deletedRelations, entityIds } = args;
  const createdRelationFromIds = createdRelations.map(r => r.from);
  return [...createdRelationFromIds, ...deletedRelations].filter(fromId => !entityIds.has(fromId));
}

export function getDeletedRelations(ops: Op[]) {
  return Effect.gen(function* (_) {
    // DELETE_TRIPLE ops don't store the value of the deleted op, so we have no way
    // of knowing if the op being deleted here is actually a relation unless we query
    // the Relations table with the entity id.
    const entityIdsForDeletedTypeOps = ops
      .filter(o => o.type === 'DELETE_TRIPLE' && o.triple.attribute === SYSTEM_IDS.TYPES)
      .map(o => o.triple.entity);

    const getRelations = Effect.all(
      entityIdsForDeletedTypeOps.map(entityId =>
        Effect.promise(() => {
          return Relations.selectOne({
            entity_id: entityId,
          });
        })
      )
    );

    // The relations we get here are unfortunately versions so we have to then query
    // the versions to get the entity ids. We could do a JOIN here with a special SQL
    // query but I've found it's super slow.
    const relations = (yield* _(getRelations)).filter(r => r !== undefined);

    const getEntityIdOfFromRelations = Effect.all(
      relations.map(relation =>
        Effect.promise(() => {
          return Versions.selectOne({
            id: relation.entity_id,
          });
        })
      )
    );

    return (yield* _(getEntityIdOfFromRelations)).filter(e => e !== undefined).map(r => r.entity_id);
  });
}
