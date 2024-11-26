import { SYSTEM_IDS } from '@geogenesis/sdk';
import { Effect } from 'effect';

import { Relations } from '~/sink/db/relations';
import type { Op } from '~/sink/types';

type PartialOp = {
  attribute: Op['triple']['attribute'];
  entity: Op['triple']['entity'];
  opType: Op['type'];
};

export function getDeletedRelationsFromOps(ops: PartialOp[]) {
  return Effect.gen(function* (_) {
    // DELETE_TRIPLE ops don't store the value of the deleted op, so we have no way
    // of knowing if the op being deleted here is actually a relation unless we query
    // the Relations table with the entity id.
    const entityIdsForDeletedTypeOps = ops
      .filter(o => o.opType === 'DELETE_TRIPLE' && o.attribute === SYSTEM_IDS.TYPES)
      .map(o => o.entity);

    const getRelations = Effect.forEach(
      entityIdsForDeletedTypeOps,
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
