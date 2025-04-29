// Make sure to install the 'pg' package
import { drizzle } from 'drizzle-orm/node-postgres';
import { Context, Data, Effect, Redacted } from 'effect';

import { ipfsCache } from './schema';
import { Environment } from '~/sink/environment';

export class DbError extends Data.TaggedError('DbError')<{
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
    },
  });

interface DbImpl {
  use: <T>(fn: (client: ReturnType<typeof createDb>) => T) => Effect.Effect<Awaited<T>, DbError, never>;
}

export class Db extends Context.Tag('Db')<Db, DbImpl>() {}

export const make = Effect.gen(function* () {
  const environment = yield* Environment;

  const db = createDb(Redacted.value(environment.databaseUrl));

  return Db.of({
    use: fn => {
      return Effect.gen(function* () {
        const result = yield* Effect.try({
          try: () => fn(db),
          catch: error => new DbError({ message: `Synchronous error in Db.use ${String(error)}`, cause: error }),
        });

        if (result instanceof Promise) {
          return yield* Effect.tryPromise({
            try: () => result,
            catch: error =>
              new DbError({
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
