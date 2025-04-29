import { Effect } from 'effect';

import { Db, make } from './db/db';
import { events } from './db/schema';
import { Environment, make as makeEnvironment } from '~/sink/environment';

const test = Effect.gen(function* () {
  const db = yield* Db;

  const result = yield* db.use(async client => await client.$count(events));

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Db, make));

Effect.runPromise(test.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
