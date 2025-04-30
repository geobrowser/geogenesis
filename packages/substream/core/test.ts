import { Effect } from 'effect';

import { events } from './services/storage/schema';
import { Storage, make } from './services/storage/storage';
import { Environment, make as makeEnvironment } from '~/core/environment';

const test = Effect.gen(function* () {
  const db = yield* Storage;

  const result = yield* db.use(async client => await client.$count(events));

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Storage, make));

Effect.runPromise(test.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
