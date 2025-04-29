import type { JsonValue } from '@bufbuild/protobuf';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { Id } from '@graphprotocol/grc-20';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Data, Duration, Effect, Either, Logger, Queue, Redacted, Schema, Stream } from 'effect';

import type { BlockEvent } from '../types';
import { IpfsCache } from './ipfs/ipfs-cache';
import { IpfsCacheWriteWorkerPool } from './ipfs/ipfs-cache-write-worker-pool';
import type { IpfsCacheQueueItem } from './ipfs/types';
import { EditPublishedEvent } from './parser';
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

    const ipfsTransport = createGrpcTransport({
      baseUrl: environment.endpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const linearTransport = createGrpcTransport({
      baseUrl: environment.endpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const ipfsStream = createStream({
      connectTransport: ipfsTransport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: true,
      startBlockNum: startBlockNumber,
      maxRetrySeconds: 600, // 10 minutes.
    });

    const linearStream = createStream({
      connectTransport: linearTransport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: true,
      startBlockNum: startBlockNumber,
      maxRetrySeconds: 600, // 10 minutes.
    });

    const ipfsQueue = yield* Queue.unbounded<IpfsCacheQueueItem>();

    const ipfsCacheSink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* () {
          const requestId = Id.generate();
          const blockNumber = Number(message.clock?.number.toString());
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

          const result = yield* handleIpfsMessage(jsonOutput, ipfsQueue, block).pipe(withRequestId(requestId));

          yield* Effect.void;
        });
      },
      handleBlockUndoSignal: message => {
        return Effect.gen(function* () {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* Effect.logInfo('Undo ipfsCacheSink');
        });
      },
    });

    const linearSink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const start = Date.now();
          const blockNumber = Number(message.clock?.number.toString());
          const requestId = Id.generate();
          const telemetry = yield* _(Telemetry);
          const logLevel = yield* _(getConfiguredLogLevel);

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
          const result = yield* _(
            handleLinearMessage(jsonOutput, block).pipe(
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
            const end = Date.now();

            yield* _(
              Effect.logInfo(`[LINEAR STREAM][BLOCK] Ended ${blockNumber} in ${end - start}ms`).pipe(
                withRequestId(requestId),
                Logger.withMinimumLogLevel(logLevel),
                Effect.provide(LoggerLive)
              )
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

    const workerPool = yield* IpfsCacheWriteWorkerPool;
    yield* workerPool.start(ipfsQueue);

    yield* Effect.all([Stream.run(ipfsStream, ipfsCacheSink), Stream.run(linearStream, linearSink)], {
      concurrency: 2,
    });
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

// @TODO: Test
export function handleIpfsMessage(output: JsonValue, queue: Queue.Queue<IpfsCacheQueueItem>, block: BlockEvent) {
  return Effect.gen(function* () {
    const events = parseOutputToEvent(output);

    yield* Effect.logInfo(`[IPFS STREAM] Processing ${events.length} events for block ${block.number}`);

    for (const event of events) {
      // @TODO: Will need to eventually parse by the event type
      const item: IpfsCacheQueueItem = {
        block,
        editsPublished: event.editsPublished,
      };

      yield* Queue.offer(queue, item);
    }
  });
}

// @TODO: Test
function parseOutputToEvent(output: JsonValue) {
  const eventsInBlock: EditPublishedEvent[] = [];
  const maybeEditPublishedEvent = Schema.decodeUnknownEither(EditPublishedEvent)(output);

  if (Either.isRight(maybeEditPublishedEvent)) {
    // Ignore the US law space for now
    // const editsPublished = maybeEditPublishedEvent.right.editsPublished.filter(
    //   e => e.daoAddress !== US_LAW_SPACE.daoAddress
    // );

    eventsInBlock.push({
      editsPublished: maybeEditPublishedEvent.right.editsPublished,
    });
  }

  return eventsInBlock;
}
