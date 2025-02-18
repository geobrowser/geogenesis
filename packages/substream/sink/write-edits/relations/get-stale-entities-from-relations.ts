import { Effect } from 'effect';

import { getDeletedRelationsFromOps } from './get-deleted-relations-from-ops';
import { Versions } from '~/sink/db';
import type { CreateRelationOp, DeleteRelationOp } from '~/sink/types';

export function getStaleEntitiesInEdit(args: {
  createdRelations: CreateRelationOp[];
  entitiesFromDeletedRelations: string[];
  entityIds: Set<string>;
}) {
  const { createdRelations, entitiesFromDeletedRelations: deletedRelations, entityIds } = args;
  const createdRelationFromIds = createdRelations.map(r => r.relation.fromEntity);

  // Only return entities that don't already have new versions in the edit. There might be duplicate
  // entity ids in created and deleted relations, so we dedupe them at the callsite.
  return [...createdRelationFromIds, ...deletedRelations].filter(entityId => !entityIds.has(entityId));
}

export function getStaleEntitiesFromDeletedRelations(ops: DeleteRelationOp[]) {
  return Effect.gen(function* (_) {
    // The relations we get here are unfortunately versions so we have to then query
    // the versions to get the entity ids. We could do a JOIN here with a special SQL
    // query but I've found it's super slow.
    const relations = yield* _(getDeletedRelationsFromOps(ops));

    const getEntityIdOfFromRelations = Effect.forEach(
      relations,
      relation =>
        Effect.promise(() => {
          return Versions.selectOne({
            id: relation.from_version_id,
          });
        }),
      {
        concurrency: 50,
      }
    );

    const maybeEntityIds = yield* _(getEntityIdOfFromRelations);
    return maybeEntityIds.filter(e => e !== undefined).map(r => r.entity_id);
  });
}
