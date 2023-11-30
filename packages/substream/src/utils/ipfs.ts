import { Effect, Schedule } from 'effect';

import { IPFS_GATEWAY } from '../constants/constants.js';
import type { UriData } from '../zod.js';

export function getFetchIpfsContentEffect(uri: string): Effect.Effect<never, Error, UriData | null> {
  return Effect.gen(function* (unwrap) {
    if (uri.startsWith('data:application/json;base64,')) {
      const base64 = uri.split(',')[1]!; // we can cast with bang because we know a base64 string will always have a second element
      const decoded = Effect.try({
        try: () => JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as UriData,
        catch: () => Error("Can't parse base64 string"),
      });

      return yield* unwrap(decoded);
    }

    if (uri.startsWith('ipfs://')) {
      const ipfsFetchEffect = Effect.tryPromise({
        try: async () => {
          const parsedCid = uri.replace('ipfs://', '');
          const url = `${IPFS_GATEWAY}${parsedCid}`;

          return await fetch(url);
        },
        catch: error => {
          return new Error("Can't fetch IPFS content");
        },
      });

      // @TODO: Add max retry time before erroring out
      const response = yield* unwrap(Effect.retry(ipfsFetchEffect, Schedule.exponential('1 seconds')));

      return yield* unwrap(
        Effect.tryPromise({
          try: async () => {
            return (await response.json()) as UriData;
          },
          // @TODO: Specific error
          catch: () => Error("Can't parse response"),
        })
      );
    }

    return null;
  });
}
