import { Command } from 'commander';
import dotenv from 'dotenv';
import { Effect, Either, pipe } from 'effect';

import { bootstrapRoot } from './src/bootstrap-root.js';
import { START_BLOCK } from './src/constants/constants.js';
import { readCursor } from './src/cursor.js';
import { populateFromCache } from './src/populate-from-cache.js';
import { runStream } from './src/run-stream.js';
import { resetPublicTablesToGenesis } from './src/utils/reset-public-tables-to-genesis.js';

dotenv.config();

export class CouldNotReadCursorError extends Error {
  _tag: 'CouldNotReadCursorError' = 'CouldNotReadCursorError';
}

async function main() {
  const program = new Command();
  program
    .option('--from-genesis', 'Start from genesis block')
    .option('--from-cache', 'Start from cached block')
    .option('--block <number>', 'Start from block number');
  program.parse(process.argv);
  const options = program.opts();

  // @TODO: How do we make the options typesafe?
  if (options.fromGenesis) {
    console.info('Resetting public tables to genesis');
    const reset = await pipe(resetPublicTablesToGenesis(), Effect.either, Effect.runPromise);

    if (Either.isLeft(reset)) {
      console.error('Could not reset public tables to genesis');
      console.error('Message: ', reset.left.message);
      console.error('Cause: ', reset.left.cause);
      console.error('Stack: ', reset.left.stack);
      process.exit(1);
    }

    const bootstrap = await pipe(bootstrapRoot(), Effect.either, Effect.runPromise);

    if (Either.isLeft(bootstrap)) {
      console.error('Could not bootstrap system entities');
      console.error('Message: ', bootstrap.left.message);
      console.error('Cause: ', bootstrap.left.cause);
      console.error('Stack: ', bootstrap.left.stack);
      process.exit(1);
    }
  }

  let startBlockNumber: number | null = null;

  if (options.fromCache) {
    console.info('Populating Geo data from cache');
    // @TODO: Effectify populateFromCache
    startBlockNumber = await populateFromCache();
    console.info(`Cache processing complete at block ${startBlockNumber}`);
  }

  /**
   * Start from cache and genesis
   *   Use startBlockNumber from cache. Fallback if not available because of errors in cache.
   * Start from cache
   *   Use startBlockNumber from cache. Fallback if not available because of errors in cache.
   * Start from genesis
   *   Use startBlockNumber from genesis.
   *
   * Neither from cache nor genesis
   *   Use cursor. Fall back to genesis start block if not available.
   */
  const configureStream = Effect.gen(function* (_) {
    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: error => new CouldNotReadCursorError(String(error)),
      })
    );

    // if (options.block) {
    //   startBlockNumber = Number(options.block);
    // }

    if (options.fromGenesis && options.fromCache) {
      console.info(`Starting stream at block ${startBlockNumber} after populating data from cache.`);
    }

    if (options.fromGenesis && !options.fromCache) {
      console.info(`Starting stream from Geo's genesis block ${START_BLOCK}.`);
      startBlockNumber = START_BLOCK;
    }

    // We're starting at the most recently indexed segment of a block without any flags
    // i.e., `substream start`
    if (!startBlockNumber && startCursor) {
      console.info(`Starting stream at latest stored cursor ${startCursor}.`);
      return yield* _(runStream({ startCursor }));
    }

    // We didn't find a cursor or we're starting from genesis. In the future
    // you'll also be able to start from a specific block number.
    yield* _(runStream({ startBlockNumber: startBlockNumber ?? START_BLOCK }));
  });

  const stream = await pipe(configureStream, Effect.either, Effect.runPromise);

  if (Either.isLeft(stream)) {
    const error = stream.left;

    switch (error._tag) {
      case 'SinkError':
        console.error('A sink error occurred:', error);
        break;
      case 'InvalidPackageError':
        console.error('An invalid package error occurred:', error);
        break;
      case 'FatalStreamError':
        console.error('A fatal stream error occurred:', error);
        break;
      case 'RetryableStreamError':
        console.error('A retryable stream error occurred and the substream did not recover:', error);
        break;
      default:
        console.error('An unknown error occurred:', error);
        break;
    }

    process.exit(1);
  }
}

main();
