import { Effect } from 'effect';

import { Db, make } from './db/db';
import { users } from './db/schema';
import { Environment, make as makeEnvironment } from '~/sink/environment';

const test = Effect.gen(function* () {
  const db = yield* Db;

  const result = yield* db.use(async client => await client.$count(users));

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Db, make));

Effect.runPromise(test.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
