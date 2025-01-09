import { type DeleteRelationOp } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { Relations } from '~/sink/db/relations';

export function getDeletedRelationsFromOps(ops: DeleteRelationOp[]) {
  return Effect.gen(function* (_) {
    // DELETE_TRIPLE ops don't store the value of the deleted op, so we have no way
    // of knowing if the op being deleted here is actually a relation unless we query
    // the Relations table with the entity id.
    const entityIdOfDeletedRelations = ops.map(o => o.relation.id);

    const getRelations = Effect.forEach(
      entityIdOfDeletedRelations,
      entityId =>
        Effect.promise(() => {
          return Relations.selectOne({
            entity_id: entityId,
          });
        }),
      {
        concurrency: 50,
      }
    );

    return (yield* _(getRelations)).filter(r => r !== undefined);
  });
}
