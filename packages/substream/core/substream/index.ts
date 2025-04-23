import type { IMessageTypeRegistry } from '@bufbuild/protobuf';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { Id } from '@graphprotocol/grc-20';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import type { BlockScopedData } from '@substreams/core/proto';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Data, Duration, Effect, Either, Logger, Redacted, Stream } from 'effect';

import { Db } from '../db/db';
import { events } from '../db/schema';
import { MANIFEST } from '~/sink/constants/constants';
import { Environment } from '~/sink/environment';
import { LoggerLive, getConfiguredLogLevel, withRequestId } from '~/sink/logs';
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

    const transport = createGrpcTransport({
      baseUrl: environment.endpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: true,
      startBlockNum: startBlockNumber,
      maxRetrySeconds: 600, // 10 minutes.
    });

    const sink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const start = Date.now();
          const blockNumber = Number(message.clock?.number.toString());
          const requestId = Id.generate();
          const telemetry = yield* _(Telemetry);
          const logLevel = yield* _(getConfiguredLogLevel);

          // If we get an unrecoverable error (how do we define those)
          // then we don't want to exit the entire handler though, and
          // continue if possible.
          const result = yield* _(
            handleMessage(message, registry).pipe(
              withRequestId(requestId),
              // Limit the maximum time a block takes to index to 5 minutes
              Effect.timeout(Duration.minutes(5))
            ),
            Effect.either
          );

          if (Either.isLeft(result)) {
            const error = result.left;

            if (error._tag === 'TimeoutException') {
              yield* _(Effect.logError('[BLOCK] Timed out after 5 minutes'));
              return;
            }

            telemetry.captureMessage(error.message);
            yield* _(Effect.logError(error.message));
            return;
          }

          const hasValidEvent = result.right;

          if (hasValidEvent) {
            yield* _(
              Effect.logInfo(`[BLOCK] Ended ${blockNumber}`).pipe(
                withRequestId(requestId),
                Logger.withMinimumLogLevel(logLevel),
                Effect.provide(LoggerLive)
              )
            );
          }

          const end = Date.now();
          yield* Effect.logInfo(`[BLOCK] Ended ${blockNumber} in ${end - start}ms`);
        });
      },

      handleBlockUndoSignal: message => {
        return Effect.gen(function* () {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* Effect.logInfo('Undo');
        });
      },
    });

    return yield* Stream.run(stream, sink);
  });
}

function handleMessage(message: BlockScopedData, registry: IMessageTypeRegistry) {
  return Effect.gen(function* () {
    yield* Effect.logInfo(message.clock?.number.toString());
    const db = yield* Db;

    const mapOutput = message.output?.mapOutput;

    if (!mapOutput || mapOutput?.value?.byteLength === 0) {
      return false;
    }

    const unpackedOutput = mapOutput.unpack(registry);
    const jsonOutput = unpackedOutput?.toJson({ typeRegistry: registry });

    if (jsonOutput === undefined) {
      yield* Effect.logError('No output');
      return false;
    }

    yield* db.use(client =>
      client
        .insert(events)
        .values({
          type: 'add_edit',
          eventJson: jsonOutput,
        })
        .execute()
    );

    return true;
  });
}
