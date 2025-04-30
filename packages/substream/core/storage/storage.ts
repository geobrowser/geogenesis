import { drizzle } from 'drizzle-orm/node-postgres';
import { Context, Data, Effect, Redacted } from 'effect';

import { entities, ipfsCache } from './schema';
import { Environment } from '~/core/environment';

export class StorageError extends Data.TaggedError('StorageError')<{
  cause?: unknown;
  message?: string;
}> {}

const createDb = (connectionString: string) =>
  drizzle({
    connection: {
      connectionString: connectionString,
    },
    schema: {
      ipfsCache,
      entities,
    },
  });

interface StorageShape {
  use: <T>(fn: (client: ReturnType<typeof createDb>) => T) => Effect.Effect<Awaited<T>, StorageError, never>;
}

export class Storage extends Context.Tag('Storage')<Storage, StorageShape>() {}

export const make = Effect.gen(function* () {
  const environment = yield* Environment;

  const db = createDb(Redacted.value(environment.databaseUrl));

  return Storage.of({
    use: fn => {
      return Effect.gen(function* () {
        const result = yield* Effect.try({
          try: () => fn(db),
          catch: error => new StorageError({ message: `Synchronous error in Db.use ${String(error)}`, cause: error }),
        });

        if (result instanceof Promise) {
          return yield* Effect.tryPromise({
            try: () => result,
            catch: error =>
              new StorageError({
                cause: error,
                message: `Asynchronous error in Db.use ${String(error)}`,
              }),
          });
        } else {
          return result;
        }
      });
    },
  });
});
