import { Duration, Effect, Either, Schedule } from 'effect';
import type { TimeoutException } from 'effect/Cause';

import { IPFS_GATEWAY } from '../constants/constants';

class UnableToParseBase64Error extends Error {
  _tag: 'UnableToParseBase64Error' = 'UnableToParseBase64Error';
}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

class UnknownContentTypeError extends Error {
  _tag: 'UnknownContentTypeError' = 'UnknownContentTypeError';
}

export function getFetchIpfsContentEffect(
  uri: string
): Effect.Effect<
  Buffer | null,
  | UnableToParseBase64Error
  | FailedFetchingIpfsContentError
  | UnableToParseJsonError
  | TimeoutException
  | UnknownContentTypeError,
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
          return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
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

          return await fetch(url, {
            headers: {
              'Content-Type': 'application/octet-stream',
            },
          });
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

      if (Either.isLeft(mainGatewayResponse)) {
        yield* unwrap(Effect.logError(`Couldn't fetch IPFS content from uri, ${mainGatewayResponse.left.message}`));
        yield* unwrap(Effect.fail(new FailedFetchingIpfsContentError(`Unable to fetch IPFS content from uri ${uri}`)));
        return null;
      }

      const response = mainGatewayResponse.right;

      return yield* unwrap(
        Effect.tryPromise({
          try: async () => {
            const buffer = await response.arrayBuffer();
            return Buffer.from(buffer);
          },
          catch: error =>
            new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
        })
      );
    }

    yield* unwrap(
      Effect.logError(
        `Encountered unknown content type when decoding content hash ${uri}. IPFS CIDs should start with ipfs://`
      )
    );
    yield* unwrap(Effect.fail(new UnknownContentTypeError(`Unknown content type when decoding content hash ${uri}`)));

    // We only support IPFS URIs or base64 encoded content with the above format
    return null;
  });
}
