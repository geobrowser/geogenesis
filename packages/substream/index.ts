import { Command } from 'commander';
import dotenv from 'dotenv';
import { Effect, Either, pipe } from 'effect';

import { bootstrapRoot } from './src/bootstrap-root.js';
import { START_BLOCK } from './src/constants/constants.js';
import { populateFromCache } from './src/populate-cache.js';
import { getStreamEffect } from './src/run-stream.js';
import { resetPublicTablesToGenesis } from './src/utils/reset-public-tables-to-genesis.js';

dotenv.config();

async function main() {
  const program = new Command();
  program.option('--from-genesis', 'Start from genesis block').option('--from-cache', 'Start from cached block');
  program.parse(process.argv);
  const options = program.opts();

  if (options.fromGenesis) {
    console.log('bootstrapping system entities');
    const reset = await pipe(resetPublicTablesToGenesis(), Effect.either, Effect.runPromise);

    if (Either.isLeft(reset)) {
      console.error('Could not reset public tables to genesis:', reset.left);
      process.exit(1);
    }

    const bootstrap = await pipe(bootstrapRoot(), Effect.either, Effect.runPromise);

    if (Either.isLeft(bootstrap)) {
      console.error('Could not bootstrap root:', bootstrap.left);
      process.exit(1);
    }
  }

  let startBlockNumber = process.env.START_BLOCK ? Number(process.env.START_BLOCK) : START_BLOCK;

  if (options.fromCache) {
    console.log('bootstrapping system entities');
    const reset = await pipe(resetPublicTablesToGenesis(), Effect.either, Effect.runPromise);

    if (Either.isLeft(reset)) {
      console.error('Could not reset public tables to genesis:', reset.left);
      process.exit(1);
    }

    console.log('bootstrapping system entities');
    const bootstrap = await pipe(bootstrapRoot(), Effect.either, Effect.runPromise);

    if (Either.isLeft(bootstrap)) {
      console.error('Could not bootstrap root:', bootstrap.left);
      process.exit(1);
    }

    console.log('populating geo data from cache');
    startBlockNumber = await populateFromCache();
  }

  const stream = await pipe(getStreamEffect(startBlockNumber), Effect.either, Effect.runPromise);

  if (Either.isLeft(stream)) {
    const error = stream.left;

    switch (error._tag) {
      case 'SinkError':
        console.error('A sink error occurred:', error);
        break;
      case 'InvalidPackageError':
        console.error('An invalid package error occurred:', error);
        break;
      case 'CouldNotReadCursorError':
        console.error('Could not read cursor from store:', error);
        break;
      case 'FatalStreamError':
        console.error('A fatal stream error occurred:', error);
        break;
      case 'RetryableStreamError':
        console.error('A retryable stream error occurred and the substream did not recover:', error);
        break;
    }

    process.exit(1);
  }
}

main();
