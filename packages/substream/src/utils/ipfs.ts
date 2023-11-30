import { Effect, Schedule } from 'effect';

import { IPFS_GATEWAY } from '../constants/constants.js';
import type { UriData } from '../zod.js';

class UnableToParseBase64Error extends Error {
  _tag: 'UnableToParseBase64Error' = 'UnableToParseBase64Error';
}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

export function getFetchIpfsContentEffect(
  uri: string
): Effect.Effect<
  never,
  UnableToParseBase64Error | FailedFetchingIpfsContentError | UnableToParseJsonError,
  UriData | null
> {
  return Effect.gen(function* (unwrap) {
    if (uri.startsWith('data:application/json;base64,')) {
      const base64 = uri.split(',')[1]!; // we can cast with bang because we know a base64 string will always have a second element
      const decoded = Effect.try({
        try: () => JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as UriData,
        catch: () => new UnableToParseBase64Error("Can't parse base64 string"),
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
          return new FailedFetchingIpfsContentError("Can't fetch IPFS content");
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
          catch: () => new UnableToParseJsonError("Can't parse response"),
        })
      );
    }

    return null;
  });
}
