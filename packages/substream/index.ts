import { Command } from 'commander';
import dotenv from 'dotenv';
import { Duration, Effect, Either, Schedule, pipe } from 'effect';

import { bootstrapRoot } from './sink/bootstrap-root.js';
import { getStreamConfiguration } from './sink/get-stream-configuration.js';
import { populateFromCache } from './sink/populate-from-cache.js';
import { runStream } from './sink/run-stream.js';
import { resetPublicTablesToGenesis } from './sink/utils/reset-public-tables-to-genesis.js';

dotenv.config();

async function main() {
  const program = new Command();
  program
    .option('--from-cache', 'Start from cached block')
    .option('--start-block <number>', 'NOT IMPLEMENTED – Start from block number')
    .option('--reset-db', 'Reset public tables to genesis');
  program.parse(process.argv);

  // @TODO: How do we make the options typesafe?
  const options = program.opts();

  /**
   * @TODO: It probably makes more sense to tie resetting the DB to a separate flag.
   *        There are probably scenarios where we want to index from the genesis block
   *        but not reset the DB.
   *
   *        I'd assume that `--from-genesis` starts from the genesis block and doesn't
   *        have any side effects related to the DB.
   */
  if (options.resetDb) {
    console.info('Resetting public tables');
    const reset = await pipe(resetPublicTablesToGenesis(), Effect.either, Effect.runPromise);

    if (Either.isLeft(reset)) {
      console.error('Could not reset public tables');
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

  let blockNumberFromCache: number | undefined;

  if (options.fromCache) {
    console.info('Populating Geo data from cache');
    // @TODO: Effectify populateFromCache
    blockNumberFromCache = await populateFromCache();
    console.info(`Cache processing complete at block ${blockNumberFromCache}`);
  }

  /**
   * The stream has several "execution states" depending on whether we are running the stream
   * from genesis, using the cache, or if we're recovering from error states.
   *
   * Start --from-cache and --start-block
   *   Use startBlockNumber from cache. Cache assumes you want to start from the entries in
   *   cache and ignores the start bock number
   * Start --from-cache
   *   Use startBlockNumber from cache.
   * Start from --start-block
   *   Use startBlockNumber passed in from CLI
   *
   * Neither --from-cache or --start-block
   *   Use cursor. Fall back to genesis start block if not available.
   *
   * If we're recovering from an error state we always use the cursor. We need to make sure we
   * don't accidentally start indexing from genesis again when restarting the stream, especially
   * since indexing can take a long time as Polygon has a boatload of blocks.
   */
  let runCount = 1;

  const runStreamWithRetries = (config: { shouldUseCursor: boolean; startBlockNumber: number | undefined }) =>
    Effect.retry(
      Effect.gen(function* (_) {
        let shouldUseCursor = false;

        // If we are recovering from a stream crash, start from the cursor.
        //
        // If we start the substream from a specific block and it crashes, we don't want to retry
        // starting from that block again and instead should start from the most recently indexed
        // cursor.
        if (runCount > 1) {
          shouldUseCursor = true;
        }

        // We increment the runCount to denote that we've started the stream at least once. If a
        // stream has run at least once and crashes, we want to start from the cursor.
        runCount = runCount + 1;

        yield* _(
          runStream({
            startBlockNumber: config.startBlockNumber,

            // If we've started the stream at least once, we want to start from the cursor, otherwise
            // default to the derived configuration value.
            shouldUseCursor: shouldUseCursor ? shouldUseCursor : config.shouldUseCursor,
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
  // from the last indexed cursor. The cursor is read inside `configureStream` so that
  // retries will try and read from the latest cursor state if available.
  //
  // If there is no cursor for some reason it will run using the passed in start
  // block number. If neither the block number or cursor is available then it will
  // throw an error.
  const stream = await pipe(
    getStreamConfiguration(options, blockNumberFromCache),
    config => runStreamWithRetries(config),
    Effect.either,
    Effect.runPromise
  );

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
