import { Effect } from 'effect';

import { uuidToHex } from '~/core/id/normalize';

import { getEntityCommentCounts } from './use-entity-comment-counts';

const MAX_IDS_PER_REQUEST = 100;

type Waiter = { resolve: (count: number) => void; reject: (error: unknown) => void };

let pending: Map<string, Waiter[]> | null = null;

/**
 * Gets one entity's comment count, sharing a request with every count asked for in the same tick.
 *
 * Each table row asks for its own count, so this turns hundreds of requests into a few.
 * An id missing from the response has 0 comments.
 */
export function getEntityCommentCountBatched(entityId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (pending === null) {
      pending = new Map();
      setTimeout(flush, 0);
    }

    const id = uuidToHex(entityId);
    pending.set(id, [...(pending.get(id) ?? []), { resolve, reject }]);
  });
}

function flush() {
  const batch = pending;
  pending = null;
  if (batch === null) return;

  const ids = [...batch.keys()];

  for (let start = 0; start < ids.length; start += MAX_IDS_PER_REQUEST) {
    const chunk = ids.slice(start, start + MAX_IDS_PER_REQUEST);

    Effect.runPromise(getEntityCommentCounts(chunk)).then(
      counts => {
        for (const id of chunk) for (const waiter of batch.get(id) ?? []) waiter.resolve(counts.get(id) ?? 0);
      },
      error => {
        for (const id of chunk) for (const waiter of batch.get(id) ?? []) waiter.reject(error);
      }
    );
  }
}
