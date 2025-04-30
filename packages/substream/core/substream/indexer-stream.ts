import type { JsonValue } from '@bufbuild/protobuf';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Data, Duration, Effect, Either, Logger, Redacted, Stream } from 'effect';

import type { BlockEvent } from '../types';
import { IpfsCache } from './ipfs/ipfs-cache';
import { parseOutputToEvent } from './substream-output';
import { MANIFEST } from '~/sink/constants/constants';
import { Environment } from '~/sink/environment';
import { LoggerLive, getConfiguredLogLevel } from '~/sink/logs';
import { Telemetry } from '~/sink/telemetry';

class InvalidPackageError extends Data.TaggedError('InvalidPackageError')<{
  cause?: unknown;
  message?: string;
}> {}

interface StreamConfig {
  startBlockNumber?: number;
}

export function runStream({ startBlockNumber }: StreamConfig) {
  return Effect.gen(function* () {
    const environment = yield* Environment;

    const substreamPackage = yield* Effect.tryPromise({
      try: () => readPackageFromFile(MANIFEST),
      catch: error => new InvalidPackageError({ cause: error }),
    });

    const { token } = yield* Effect.tryPromise({
      try: () => authIssue(Redacted.value(environment.apiKey), environment.authIssueUrl),
      catch: error =>
        new InvalidPackageError({ message: `Could not read package at path ${MANIFEST}. ${String(error)}` }),
    });

    const registry = createRegistry(substreamPackage);

    const linearTransport = createGrpcTransport({
      baseUrl: environment.endpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const linearStream = createStream({
      connectTransport: linearTransport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: true,
      startBlockNum: startBlockNumber,
      maxRetrySeconds: 600, // 10 minutes.
    });

    const linearSink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* () {
          const start = Date.now();
          const blockNumber = Number(message.clock?.number.toString());
          const telemetry = yield* Telemetry;
          const logLevel = yield* getConfiguredLogLevel;

          const mapOutput = message.output?.mapOutput;

          if (!mapOutput || mapOutput?.value?.byteLength === 0) {
            return false;
          }

          const unpackedOutput = mapOutput.unpack(registry);
          const jsonOutput = unpackedOutput?.toJson({ typeRegistry: registry });

          if (jsonOutput === undefined) {
            yield* Effect.logError('No output');
            return;
          }

          const block: BlockEvent = {
            cursor: message.cursor,
            number: blockNumber,
            timestamp: message.clock?.timestamp?.seconds.toString() ?? Date.now().toString(),
          };

          // If we get an unrecoverable error (how do we define those)
          // then we don't want to exit the entire handler though, and
          // continue if possible.
          const result = yield* Effect.either(
            handleLinearMessage(jsonOutput, block).pipe(
              // Limit the maximum time a block takes to index to 5 minutes
              Effect.timeout(Duration.minutes(5))
            )
          );

          if (Either.isLeft(result)) {
            const error = result.left;

            if (error._tag === 'TimeoutException') {
              yield* Effect.logError('[BLOCK] Timed out after 5 minutes');
              return;
            }

            telemetry.captureMessage(error.message);
            yield* Effect.logError(error.message);
            return;
          }

          const hasValidEvent = result.right;

          if (hasValidEvent) {
            const end = Date.now();

            yield* Effect.logInfo(`[LINEAR STREAM][BLOCK] Ended ${blockNumber} in ${end - start}ms`).pipe(
              Logger.withMinimumLogLevel(logLevel),
              Effect.provide(LoggerLive)
            );
          }
        });
      },

      handleBlockUndoSignal: message => {
        return Effect.gen(function* () {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* Effect.logInfo('Undo');
        });
      },
    });

    yield* Stream.run(linearStream, linearSink);
  });
}

// @TODO: Deterministic simulation testing
export function handleLinearMessage(output: JsonValue, block: BlockEvent) {
  return Effect.gen(function* () {
    const ipfsCache = yield* IpfsCache;
    const events = parseOutputToEvent(output);

    yield* Effect.logInfo(`[LINEAR STREAM] Processing ${events.length} events for block ${block.number}`);

    const data = yield* Effect.forEach(
      events,
      e =>
        Effect.gen(function* () {
          return yield* Effect.forEach(e.editsPublished, e => {
            return Effect.gen(function* () {
              const now = Date.now();
              const decoded = yield* ipfsCache.get(e.contentUri);
              const end = Date.now();
              const duration = end - now;

              yield* Effect.logInfo(
                `[LINEAR STREAM] Fetched IPFS data from cache in ${duration}ms. Block: ${block.number}`
              );

              return decoded;
            });
          });
        }),
      {
        concurrency: 50,
      }
    );

    return events.length > 0;
  });
}
