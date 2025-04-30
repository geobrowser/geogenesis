import { Context, Data, Effect } from 'effect';

import { type DbEntity, entities } from '../services/storage/schema';
import { Storage } from '../services/storage/storage';
import type { BlockEvent } from '../types';
import type { CreateRelationOp, DeleteRelationOp, DeleteTripleOp, OmitStrict, Op, SetTripleOp } from './types';

interface EntityStorageShape {
  insert(entities: DbEntity[], block: BlockEvent): Effect.Effect<void, EntityStorageError>;
}

export class EntityStorage extends Context.Tag('EntityStorage')<EntityStorage, EntityStorageShape>() {}

export class EntityStorageError extends Data.TaggedError('EntityStorageError')<{
  cause?: unknown;
  message?: string;
}> {}

export const make = Effect.gen(function* () {
  const storage = yield* Storage;

  return EntityStorage.of({
    insert: (dbEntities, block) =>
      Effect.gen(function* () {
        yield* storage
          .use(client =>
            client
              .insert(entities)
              .values(dbEntities)
              .onConflictDoUpdate({
                target: entities.id,
                set: {
                  updatedAt: block.timestamp,
                  updatedAtBlock: block.number.toString(),
                },
              })
              .execute()
          )
          .pipe(
            Effect.mapError(
              error =>
                new EntityStorageError({
                  message: `[LINEAR STREAM][ENTITY] Failed to insert entities. ${String(error)}`,
                  cause: error,
                })
            )
          );
      }),
  });
});

export class EntityStorageMapper {
  static toEntityStorage(ops: OmitStrict<Op, 'space'>[], block: BlockEvent): DbEntity[] {
    const ids: string[] = [];

    for (const op of ops) {
      switch (op.type) {
        case 'CREATE_RELATION':
          ids.push((op as CreateRelationOp).relation.toEntity);
          ids.push((op as CreateRelationOp).relation.fromEntity);
          ids.push((op as CreateRelationOp).relation.id);
          break;
        case 'DELETE_RELATION':
          ids.push((op as DeleteRelationOp).relation.id);
          break;
        case 'SET_TRIPLE':
        case 'DELETE_TRIPLE':
          ids.push((op as SetTripleOp | DeleteTripleOp).triple.entity);
          break;
      }
    }

    const uniqueEntityIds = new Set(ids);

    return Array.from(uniqueEntityIds).map(entityId => ({
      id: entityId,
      createdAt: block.timestamp,
      createdAtBlock: block.number.toString(),
      updatedAt: block.timestamp,
      updatedAtBlock: block.number.toString(),
    }));
  }
}
