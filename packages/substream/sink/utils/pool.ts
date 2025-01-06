import { Effect, Secret, pipe } from 'effect';
import * as pg from 'pg';

import { Environment, EnvironmentLive } from '../environment';

const make = Effect.gen(function* (_) {
  const environment = yield* _(Environment);

  return new pg.Pool({
    connectionString: Secret.value(environment.databaseUrl),
    max: 50,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 10_000,
    maxUses: 7_500,
  });
});

export const pool = pipe(make, Effect.provideService(Environment, EnvironmentLive), Effect.runSync);

pool.on('error', err => console.error('Pool Error', err)); // don't let a pg restart kill your app
