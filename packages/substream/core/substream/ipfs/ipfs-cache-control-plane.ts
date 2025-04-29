import { Context, Effect, Queue } from 'effect';

import { IpfsCache } from './ipfs-cache';
import type { IpfsCacheQueueItem } from './types';

interface IpfsCacheControlPlaneImpl {
  start(queue: Queue.Queue<IpfsCacheQueueItem>): Effect.Effect<void, never, IpfsCache>;
}

export class IpfsCacheControlPlane extends Context.Tag('IpfsCacheControlPlane')<
  IpfsCacheControlPlane,
  IpfsCacheControlPlaneImpl
>() {}

export const IpfsControlPlaneLive = IpfsCacheControlPlane.of({
  start: (queue: Queue.Queue<IpfsCacheQueueItem>) =>
    Effect.gen(function* () {
      const runQueue = Effect.gen(function* () {
        const ipfsCache = yield* IpfsCache;

        yield* Effect.logInfo('Starting queue processing');
        const chainEvent = yield* Queue.take(queue);
        yield* ipfsCache.put(chainEvent.editsPublished, chainEvent.block);
      });

      const workerPool = Effect.gen(function* () {
        const workers = yield* Effect.forEach(
          Array.from({ length: 10 }),
          () => Effect.fork(runQueue.pipe(Effect.forever)),
          {
            concurrency: 10,
          }
        );

        return workers;
      });

      yield* workerPool;
    }),
});
