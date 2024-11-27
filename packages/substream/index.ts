import { Command } from 'commander';
import { Effect, Either, pipe } from 'effect';

import { bootstrapRoot } from './sink/bootstrap/bootstrap-root';
import { readStartBlock } from './sink/cursor';
import { Environment, EnvironmentLive } from './sink/environment';
import { getStreamConfiguration } from './sink/get-stream-configuration';
import { runStream } from './sink/run-stream';
import { Telemetry, TelemetryLive } from './sink/telemetry';
import { bootstrapTest } from './sink/test/bootstrap-test-data';
import { resetPublicTablesToGenesis } from './sink/utils/reset-public-tables-to-genesis';

const main = Effect.gen(function* (_) {
  const TelemetryLive = yield* _(Telemetry);

  const program = new Command();
  program
    .option('--start-block <number>', 'Start from block number')
    .option('--reset-db', 'Reset public tables to genesis');
  program.parse(process.argv);

  // @TODO: How do we make the options typesafe?
  const options = program.opts();

  if (options.resetDb) {
    console.info('Resetting public tables');
    const reset = yield* _(pipe(resetPublicTablesToGenesis(), Effect.either));

    if (Either.isLeft(reset)) {
      TelemetryLive.captureMessage('Could not reset public tables');

      console.error('Could not reset public tables');
      console.error('Message: ', reset.left.message);
      console.error('Cause: ', reset.left.cause);
      console.error('Stack: ', reset.left.stack);
      process.exit(1);
    }

    const bootstrap = yield* _(pipe(bootstrapRoot, Effect.either));

    if (Either.isLeft(bootstrap)) {
      TelemetryLive.captureMessage('Could not bootstrap system entities');

      console.error('Could not bootstrap system entities');
      console.error('Message: ', bootstrap.left.message);
      console.error('Cause: ', bootstrap.left.cause);
      console.error('Stack: ', bootstrap.left.stack);
      process.exit(1);
    }

    const testBootstrap = yield* _(pipe(bootstrapTest, Effect.either));

    if (Either.isLeft(testBootstrap)) {
      TelemetryLive.captureMessage('Could not bootstrap test entities');

      console.error('Could not bootstrap test entities');
      console.error('Message: ', testBootstrap.left.message);
      console.error('Cause: ', testBootstrap.left.cause);
      console.error('Stack: ', testBootstrap.left.stack);
      process.exit(1);
    }
  }

  const blockNumberFromCache = yield* _(Effect.promise(() => readStartBlock()));

  /**
   * The stream has several "execution states" depending on whether we are running the stream
   * from genesis, using the cache, or if we're recovering from error states.
   *
   * If we're recovering from an error state we always use the cursor. We need to make sure we
   * don't accidentally start indexing from genesis again when restarting the stream, especially
   * since indexing can take a long time as Polygon has a boatload of blocks.
   */
  let runCount = 1;

  const runStreamWithConfiguration = (config: { shouldUseCursor: boolean; startBlockNumber: number | undefined }) =>
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
            startBlockNumber: config.startBlockNumber ?? blockNumberFromCache ?? undefined,

            // If we've started the stream at least once, we want to start from the cursor, otherwise
            // default to the derived configuration value.
            shouldUseCursor: shouldUseCursor ? shouldUseCursor : config.shouldUseCursor,
          })
        );
      }),
      {
        while: error => {
          return error._tag !== 'TimeoutError';
        },
        times: 5,
      }
    );

  const stream = yield* _(
    pipe(getStreamConfiguration(options, blockNumberFromCache ?? undefined), runStreamWithConfiguration, Effect.either)
  );

  if (Either.isLeft(stream)) {
    const error = stream.left;
    TelemetryLive.captureException(error);

    switch (error._tag) {
      case 'TimeoutError':
        console.error('The stream timed out', error);
        break;
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
});

Effect.runPromise(
  main.pipe(Effect.provideService(Telemetry, TelemetryLive), Effect.provideService(Environment, EnvironmentLive))
);
