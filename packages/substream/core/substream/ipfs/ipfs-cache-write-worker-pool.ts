import { Context, Effect, Queue } from 'effect';

import { IpfsCache } from './ipfs-cache';
import type { IpfsCacheQueueItem } from './types';

interface IpfsCacheWriteWorkerPoolImpl {
  start(queue: Queue.Queue<IpfsCacheQueueItem>): Effect.Effect<void, never, IpfsCache>;
}

export class IpfsCacheWriteWorkerPool extends Context.Tag('IpfsCacheWriteWorkerPool')<
  IpfsCacheWriteWorkerPool,
  IpfsCacheWriteWorkerPoolImpl
>() {}

export const IpfsCacheWriteWorkerPoolLive = IpfsCacheWriteWorkerPool.of({
  start: (queue: Queue.Queue<IpfsCacheQueueItem>) =>
    Effect.gen(function* () {
      const processQueueItem = Effect.gen(function* () {
        const ipfsCache = yield* IpfsCache;
        const chainEvent = yield* Queue.take(queue);
        yield* Effect.logInfo(
          `[IPFS WORKER POOL] Processing item from queue. ${yield* Queue.size(queue)} items remaining in Queue`
        );
        yield* ipfsCache.put(chainEvent.editsPublished, chainEvent.block);
      });

      const workerPool = Effect.gen(function* () {
        yield* Effect.logInfo('[IPFS WORKER POOL] Starting queue processing');

        const workers = yield* Effect.forEach(
          Array.from({ length: 10 }),
          () => Effect.fork(processQueueItem.pipe(Effect.forever)),
          {
            concurrency: 10,
          }
        );

        return workers;
      });

      yield* workerPool;
    }),
});
