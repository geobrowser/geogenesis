import { Effect } from 'effect';

import { ipfsCache } from './storage/schema';
import { Storage, make } from './storage/storage';
import { Environment, make as makeEnvironment } from '~/core/environment';

const reset = Effect.gen(function* () {
  const db = yield* Storage;

  const result = yield* db.use(async client => await client.delete(ipfsCache).execute());

  console.log('Result:', result);
}).pipe(Effect.provideServiceEffect(Storage, make));

Effect.runPromise(reset.pipe(Effect.provideServiceEffect(Environment, makeEnvironment)));
