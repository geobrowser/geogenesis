import { SYSTEM_IDS, parseEntityFromGraphScheme } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { getDeletedRelationsFromOps } from './get-deleted-relations-from-ops';
import { Versions } from '~/sink/db';
import type { Op } from '~/sink/types';

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
      t.triple.value.type === 'URI' &&
      t.triple.value.value === SYSTEM_IDS.RELATION_TYPE
  );
  const to = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_TO_ATTRIBUTE && t.triple.value.type === 'URI'
  );
  const from = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_FROM_ATTRIBUTE && t.triple.value.type === 'URI'
  );
  const type = setTriples.find(
    t => t.triple.attribute === SYSTEM_IDS.RELATION_TYPE_ATTRIBUTE && t.triple.value.type === 'URI'
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

  const toId = to ? parseEntityFromGraphScheme(to.triple.value.value) : null;
  const fromId = from ? parseEntityFromGraphScheme(from.triple.value.value) : null;
  const typeId = type ? parseEntityFromGraphScheme(type.triple.value.value) : null;

  if (!toId || !fromId || !typeId) {
    return null;
  }
  return {
    to: toId,
    from: fromId,
    entityId: entityId,
    typeOf: typeId,
    index: index?.triple.value.value,
  };
}

export function getStaleEntitiesInEdit(args: {
  createdRelations: RelationWithEntities[];
  entitiesFromDeletedRelations: string[];
  entityIds: Set<string>;
}) {
  const { createdRelations, entitiesFromDeletedRelations: deletedRelations, entityIds } = args;
  const createdRelationFromIds = createdRelations.map(r => r.from);
  return [...createdRelationFromIds, ...deletedRelations].filter(fromId => !entityIds.has(fromId));
}

export function getStaleEntitiesFromDeletedRelations(ops: Op[]) {
  return Effect.gen(function* (_) {
    // The relations we get here are unfortunately versions so we have to then query
    // the versions to get the entity ids. We could do a JOIN here with a special SQL
    // query but I've found it's super slow.
    const relations = yield* _(
      getDeletedRelationsFromOps(
        ops.map(o => {
          return {
            attribute: o.triple.attribute,
            entity: o.triple.entity,
            opType: o.type,
          };
        })
      )
    );

    const getEntityIdOfFromRelations = Effect.all(
      relations.map(relation =>
        Effect.promise(() => {
          return Versions.selectOne({
            id: relation.from_version_id,
          });
        })
      )
    );

    const maybeEntityIds = yield* _(getEntityIdOfFromRelations);
    return maybeEntityIds.filter(e => e !== undefined).map(r => r.entity_id);
  });
}
