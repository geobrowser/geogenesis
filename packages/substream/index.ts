import { Command } from 'commander';
import { Duration, Effect, Either, Schedule, pipe } from 'effect';

import { bootstrapRoot } from './sink/bootstrap-root';
import { Environment, EnvironmentLive } from './sink/environment';
import { getStreamConfiguration } from './sink/get-stream-configuration';
import { runStream } from './sink/run-stream';
import { Telemetry, TelemetryLive } from './sink/telemetry';
import { resetPublicTablesToGenesis } from './sink/utils/reset-public-tables-to-genesis';

function initialize() {}

async function main() {
  const program = new Command();
  program
    .option('--start-block <number>', 'NOT IMPLEMENTED – Start from block number')
    .option('--reset-db', 'Reset public tables to genesis');
  program.parse(process.argv);

  // @TODO: How do we make the options typesafe?
  const options = program.opts();

  if (options.resetDb) {
    console.info('Resetting public tables');
    const reset = await pipe(resetPublicTablesToGenesis(), Effect.either, Effect.runPromise);

    if (Either.isLeft(reset)) {
      TelemetryLive.captureMessage('Could not reset public tables');

      console.error('Could not reset public tables');
      console.error('Message: ', reset.left.message);
      console.error('Cause: ', reset.left.cause);
      console.error('Stack: ', reset.left.stack);
      process.exit(1);
    }

    const bootstrap = await pipe(bootstrapRoot(), Effect.either, Effect.runPromise);

    if (Either.isLeft(bootstrap)) {
      TelemetryLive.captureMessage('Could not bootstrap system entities');

      console.error('Could not bootstrap system entities');
      console.error('Message: ', bootstrap.left.message);
      console.error('Cause: ', bootstrap.left.cause);
      console.error('Stack: ', bootstrap.left.stack);
      process.exit(1);
    }
  }

  let blockNumberFromCache: number | undefined;

  /**
   * The stream has several "execution states" depending on whether we are running the stream
   * from genesis, using the cache, or if we're recovering from error states.
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
          }),
          Effect.provideService(Telemetry, TelemetryLive),
          Effect.provideService(Environment, EnvironmentLive)
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
    TelemetryLive.captureException(error);

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
