import { Effect } from 'effect';

import { Db, make } from './db/db';
import { ipfsCache } from './db/schema';
import { Environment, make as makeEnvironment } from '~/sink/environment';

const reset = Effect.gen(function* () {
  const db = yield* Db;

  const result = yield* db.use(async client => await client.delete(ipfsCache).execute());

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Db, make));

Effect.runPromise(reset.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
