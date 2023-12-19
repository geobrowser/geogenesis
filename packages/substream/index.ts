import { Command } from 'commander';
import dotenv from 'dotenv';
import { Duration, Effect, Either, Schedule, pipe } from 'effect';

import { bootstrapRoot } from './src/bootstrap-root.js';
import { START_BLOCK } from './src/constants/constants.js';
import { populateFromCache } from './src/populate-from-cache.js';
import { runStream } from './src/run-stream.js';
import { resetPublicTablesToGenesis } from './src/utils/reset-public-tables-to-genesis.js';

dotenv.config();

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
  let runCount = 1;

  const configureStream = Effect.retry(
    Effect.gen(function* (_) {
      // if (options.block) {
      //   startBlockNumber = Number(options.block);
      // }

      let shouldUseCursor = true;

      if (options.fromGenesis && options.fromCache) {
        console.info(`Starting stream at block ${startBlockNumber} after populating data from cache.`);
        shouldUseCursor = false;
      }

      if (options.fromGenesis && !options.fromCache) {
        console.info(`Starting stream from Geo's genesis block ${START_BLOCK}.`);
        startBlockNumber = START_BLOCK;
        shouldUseCursor = false;
      }

      // We're starting at the most recently indexed segment of a block without any flags
      // i.e., `substream start`
      if (!startBlockNumber) {
        console.info(`Starting stream from latest stored cursor`);
        return yield* _(runStream({ shouldUseCursor: true }));
      }

      // If we are recovering from a stream error, start from the cursor
      if (runCount > 1) {
        shouldUseCursor = true;
      }

      yield* _(
        runStream({
          startBlockNumber: startBlockNumber ?? START_BLOCK,
          shouldUseCursor,
        })
      );
    }),
    // Retry jittered exponential with base of 100ms for up to 10 minutes.
    Schedule.exponential(100).pipe(
      Schedule.jittered,
      Schedule.compose(Schedule.elapsed),
      // Retry for 10 minutes.
      Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(600)))
    )
  );

  // Retry the stream for ~10 minutes. If it fails during indexing we will restart
  // from the last indexed cursor. The cursor is read inside `runStream` so that
  // retries will try and read from the latest cursor state if available.
  //
  // If there is no cursor for some reason it will run using the passed in start
  // block number. If neither the block number or cursor is available then it will
  // throw an error.
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
      case 'InvalidStreamConfigurationError':
        console.error(
          'The stream was passed an invalid configuration. Either startBlockNumber or startCursor needs to be passed. ',
          error
        );
        break;
      case 'CouldNotReadCursorError':
        console.error('Could not read cursor:', error);
        break;
      default:
        console.error('An unknown error occurred:', error);
        break;
    }

    process.exit(1);
  }
}

main();
