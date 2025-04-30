import type { JsonValue } from '@bufbuild/protobuf';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Data, Effect, Either, Queue, Redacted, Schema, Stream } from 'effect';

import type { BlockEvent } from '../types';
import { IpfsCacheWriteWorkerPool } from './ipfs/ipfs-cache-write-worker-pool';
import type { IpfsCacheQueueItem } from './ipfs/types';
import { EditPublishedEvent } from './parser';
import { MANIFEST } from '~/sink/constants/constants';
import { Environment } from '~/sink/environment';

class InvalidPackageError extends Data.TaggedError('InvalidPackageError')<{
  cause?: unknown;
  message?: string;
}> {}

interface StreamConfig {
  startBlockNumber?: number;
}

export function runCache({ startBlockNumber }: StreamConfig) {
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

    const ipfsStream = createStream({
      connectTransport: ipfsTransport,
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

          yield* handleIpfsMessage(jsonOutput, ipfsQueue, block);
        });
      },
      handleBlockUndoSignal: message => {
        return Effect.gen(function* () {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* Effect.logInfo('Undo ipfsCacheSink');
        });
      },
    });

    const workerPool = yield* IpfsCacheWriteWorkerPool;
    yield* workerPool.start(ipfsQueue);

    yield* Stream.run(ipfsStream, ipfsCacheSink);
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
