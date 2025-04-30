import { Effect } from 'effect';

import { entities } from './services/storage/schema';
import { Storage, make } from './services/storage/storage';
import { Environment, make as makeEnvironment } from '~/core/services/environment';

const reset = Effect.gen(function* () {
  const db = yield* Storage;

  // const result = yield* db.use(async client => await client.delete(ipfsCache).execute());
  const result = yield* db.use(async client => await client.delete(entities).execute());

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Storage, make));

Effect.runPromise(reset.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
