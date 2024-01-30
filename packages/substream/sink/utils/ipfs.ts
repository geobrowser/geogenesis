import { Effect, Either, Schedule } from 'effect';

import { IPFS_GATEWAY } from '../constants/constants.js';
import type { ContentProposal, Entry, FullEntry, Proposal, UriData } from '../zod.js';

class UnableToParseBase64Error extends Error {
  _tag: 'UnableToParseBase64Error' = 'UnableToParseBase64Error';
}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

function getFetchIpfsContentEffect(
  uri: string
): Effect.Effect<
  never,
  UnableToParseBase64Error | FailedFetchingIpfsContentError | UnableToParseJsonError,
  UriData | null
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

      // @TODO: Add max retry time before erroring out
      const response = yield* unwrap(Effect.retry(ipfsFetchEffect, Schedule.exponential('1 seconds')));

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

export function getEntryWithIpfsContent(entry: Entry): Effect.Effect<never, never, FullEntry | null> {
  return Effect.gen(function* (unwrap) {
    const fetchIpfsContentEffect = getFetchIpfsContentEffect(entry.uri);

    const maybeIpfsContent = yield* unwrap(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${entry.uri}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${entry.uri}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${entry.uri}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${entry.uri}`, error);
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    return {
      ...entry,
      uriData: ipfsContent,
    };
  });
}

export function getProposalWithIpfsContent(entry: Proposal): Effect.Effect<never, never, ContentProposal | null> {
  return Effect.gen(function* (unwrap) {
    const fetchIpfsContentEffect = getFetchIpfsContentEffect(entry.metadata);

    const maybeIpfsContent = yield* unwrap(Effect.either(fetchIpfsContentEffect));

    if (Either.isLeft(maybeIpfsContent)) {
      const error = maybeIpfsContent.left;

      switch (error._tag) {
        case 'UnableToParseBase64Error':
          console.error(`Unable to parse base64 string ${entry.metadata}`, error);
          break;
        case 'FailedFetchingIpfsContentError':
          console.error(`Failed fetching IPFS content from uri ${entry.metadata}`, error);
          break;
        case 'UnableToParseJsonError':
          console.error(`Unable to parse JSON when reading content from uri ${entry.metadata}`, error);
          break;
        default:
          console.error(`Unknown error when fetching IPFS content for uri ${entry.metadata}`, error);
          break;
      }

      return null;
    }

    const ipfsContent = maybeIpfsContent.right;

    if (!ipfsContent) {
      return null;
    }

    switch (ipfsContent.type) {
      case ''
    }

    return {
      ...entry,
      // @TODO: Return different data type depending on the type of content
      content: ipfsContent,
    };
  });
}
