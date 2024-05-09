import { Duration, Effect, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';

import { IPFS_GATEWAY } from '../constants/constants';
import { type UriData } from '../zod';

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
  UriData | null,
  UnableToParseBase64Error | FailedFetchingIpfsContentError | UnableToParseJsonError | TimeoutException,
  never
> {
  return Effect.gen(function* (unwrap) {
    if (uri.startsWith('data:application/json;base64,')) {
      const base64 = uri.split(',')[1];

      if (!base64) {
        return null;
      }

      const decoded = Effect.try({
        try: () => {
          return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as UriData;
        },
        catch: error => {
          return new UnableToParseBase64Error(`Unable to parse base64 string ${uri}. ${String(error)}`);
        },
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
          return new FailedFetchingIpfsContentError(`Failed fetching IPFS content from uri ${uri}. ${String(error)}`);
        },
      });

      const mainGatewayResponse = yield* unwrap(
        Effect.either(
          // Attempt to fetch with jittered exponential backoff for 30 seconds before failing
          Effect.retry(
            ipfsFetchEffect.pipe(Effect.timeout(Duration.seconds(30))),
            Schedule.exponential(100).pipe(
              Schedule.jittered,
              Schedule.compose(Schedule.elapsed),
              // Retry for 1 minute.
              Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
            )
          )
        )
      );

      // @HACK: May 09, 2024: We're currently using Edge & Node's IPFS cluster. They are
      // in the process of a migration where some data in not available on every node. Try
      // two nodes until we are on our own IPFS infra.
      if (Either.isLeft(mainGatewayResponse)) {
        const secondaryIpfsFetchEffect = Effect.tryPromise({
          try: async () => {
            const parsedCid = uri.replace('ipfs://', '');
            const url = `https://api.thegraph.com/ipfs/api/v0/cat?arg=${parsedCid}`;

            return await fetch(url);
          },
          catch: error => {
            return new FailedFetchingIpfsContentError(`Failed fetching IPFS content from uri ${uri}. ${String(error)}`);
          },
        });

        const secondaryGatewayResponse = yield* unwrap(
          // Attempt to fetch with jittered exponential backoff for 30 seconds before failing
          Effect.retry(
            secondaryIpfsFetchEffect.pipe(Effect.timeout(Duration.seconds(30))),
            Schedule.exponential(100).pipe(
              Schedule.jittered,
              Schedule.compose(Schedule.elapsed),
              // Retry for 1 minute.
              Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
            )
          )
        );

        return yield* unwrap(
          Effect.tryPromise({
            try: async () => {
              return (await secondaryGatewayResponse.json()) as UriData;
            },
            catch: error =>
              new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
          })
        );
      }

      const response = mainGatewayResponse.right;

      return yield* unwrap(
        Effect.tryPromise({
          try: async () => {
            return (await response.json()) as UriData;
          },
          catch: error =>
            new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
        })
      );
    }

    // We only support IPFS URIs or base64 encoded content with the above format
    return null;
  });
}
