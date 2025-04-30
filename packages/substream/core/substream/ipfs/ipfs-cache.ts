import { Edit } from '@graphprotocol/grc-20/proto';
import { eq } from 'drizzle-orm';
import { Context, Data, Duration, Effect, Either, Schedule } from 'effect';

import { type DecodedEdit, type EditPublishedEvent, ZodEdit } from '../parser';
import { ipfsCache } from '~/core/storage/schema';
import { Storage } from '~/core/storage/storage';
import type { BlockEvent } from '~/core/types';
import { IPFS_GATEWAY } from '~/sink/constants/constants';

interface IpfsCacheImpl {
  put(
    events: EditPublishedEvent['editsPublished'],
    block: BlockEvent
  ): Effect.Effect<
    void,
    FailedFetchingIpfsContentError | UnableToParseJsonError | UnknownContentTypeError | CacheMissError
  >;
  get(uri: string): Effect.Effect<DecodedEdit, CacheMissError, Storage>;
}

export class IpfsCache extends Context.Tag('IpfsCache')<IpfsCache, IpfsCacheImpl>() {}

class FailedFetchingIpfsContentError extends Error {
  _tag: 'FailedFetchingIpfsContentError' = 'FailedFetchingIpfsContentError';
}

class UnableToParseJsonError extends Error {
  _tag: 'UnableToParseJsonError' = 'UnableToParseJsonError';
}

class UnknownContentTypeError extends Error {
  _tag: 'UnknownContentTypeError' = 'UnknownContentTypeError';
}

class CacheMissError extends Data.TaggedError('CacheMissError')<{
  cause?: unknown;
  message?: string;
}> {}

export const make = Effect.gen(function* () {
  const db = yield* Storage;

  return IpfsCache.of({
    put: (events, block) =>
      Effect.gen(function* () {
        const now = Date.now();
        yield* Effect.logInfo(`[IPFS STREAM][CACHE] Processing ${events.length} items for block ${block.number}`);

        const result = yield* Effect.forEach(
          events,
          e => {
            return Effect.gen(function* () {
              const alreadyExists = yield* db
                .use(client => client.query.ipfsCache.findFirst({ where: eq(ipfsCache.uri, e.contentUri) }).execute())
                .pipe(
                  Effect.mapError(
                    e => new CacheMissError({ message: `[IPFS STREAM][CACHE] Error checking cache: ${String(e)}` })
                  )
                );

              if (alreadyExists) {
                yield* Effect.logDebug(`[IPFS STREAM][CACHE] Item with uri ${e.contentUri} already exists, skipping`);
                return null;
              }

              const contents = yield* fetchIpfsContent(e.contentUri);

              if (contents === null) {
                return {
                  uri: e.contentUri,
                  dao: e.daoAddress,
                  plugin: e.pluginAddress,
                  block: block.number,
                  contents: null,
                  isErrored: true,
                };
              }

              const decoded = yield* decodeEdit(contents);

              return {
                uri: e.contentUri,
                dao: e.daoAddress,
                plugin: e.pluginAddress,
                block: block.number,
                contents: decoded,
                isErrored: decoded === null,
              };
            });
          },
          {
            concurrency: 50,
          }
        );

        const end = Date.now();
        const duration = end - now;

        const unwrittenResults = result.filter(r => r !== null);

        if (unwrittenResults.length === 0) {
          yield* Effect.logDebug(
            `[IPFS STREAM][CACHE] No unwritten results for block ${block.number}. Duration: ${duration}ms`
          );
          return;
        }

        yield* db
          .use(client =>
            client
              .insert(ipfsCache)
              .values(
                unwrittenResults.map(r => {
                  return {
                    uri: r.uri,
                    json: r.contents,
                    block: r.block.toString(),
                    isErrored: r.isErrored,
                  };
                })
              )
              .execute()
          )
          .pipe(
            Effect.mapError(
              e => new CacheMissError({ message: `[IPFS STREAM][CACHE] Error writing to cache: ${String(e)}` })
            )
          );

        yield* Effect.logInfo(
          `[IPFS STREAM][CACHE] Finished processing ${result.length} items for block ${block.number}. Duration: ${duration}ms`
        );
      }),
    get: uri =>
      Effect.gen(function* () {
        const db = yield* Storage;

        const result = yield* db
          .use(client => client.query.ipfsCache.findFirst({ where: eq(ipfsCache.uri, uri) }).execute())
          .pipe(
            Effect.mapError(
              e => new CacheMissError({ message: `[IPFS STREAM][CACHE] Error writing to cache: ${String(e)}` })
            )
          );

        if (!result) {
          return yield* new CacheMissError({
            message: `[LINEAR STREAM][CACHE] Could not find cache item for uri ${uri}`,
          });
        }

        return result.json as DecodedEdit;
      }).pipe(
        Effect.retry({
          schedule: Schedule.exponential(50).pipe(
            Schedule.jittered,
            Schedule.tapOutput(() => Effect.logInfo('[LINEAR STREAM][CACHE] Retrying cache item fetch'))
          ),
        })
      ),
  });
});

export function fetchIpfsContent(
  uri: string
): Effect.Effect<Buffer | null, FailedFetchingIpfsContentError | UnableToParseJsonError | UnknownContentTypeError> {
  return Effect.gen(function* () {
    if (!uri.startsWith('ipfs://')) {
      yield* Effect.logError(
        `Encountered unknown content type when decoding content hash ${uri}. IPFS CIDs should start with ipfs://`
      );
      yield* Effect.fail(new UnknownContentTypeError(`Unknown content type when decoding content hash ${uri}`));

      return null;
    }

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

    const result = yield* Effect.either(
      // Attempt to fetch with jittered exponential backoff for 30 seconds before failing
      Effect.retry(
        ipfsFetchEffect.pipe(Effect.timeout(Duration.seconds(30))),
        Schedule.exponential(100).pipe(
          Schedule.jittered,
          Schedule.compose(Schedule.elapsed),
          Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.seconds(30)))
        )
      )
    );

    if (Either.isLeft(result)) {
      yield* Effect.logError(`Couldn't fetch IPFS content from uri, ${result.left.message}`);
      yield* Effect.fail(new FailedFetchingIpfsContentError(`Unable to fetch IPFS content from uri ${uri}`));
      return null;
    }

    const response = result.right;

    return yield* Effect.tryPromise({
      try: async () => {
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer);
      },
      catch: error =>
        new UnableToParseJsonError(`Unable to parse JSON when reading content from uri ${uri}. ${String(error)}`),
    });
  });
}

export class CouldNotDecodeProtobufError extends Error {
  _tag: 'CouldNotDecodeProtobufError' = 'CouldNotDecodeProtobufError';
}

function decode<T>(fn: () => T) {
  return Effect.gen(function* (_) {
    const result = yield* _(
      Effect.try({
        try: () => fn(),
        catch: error => new CouldNotDecodeProtobufError(String(error)),
      }),
      Effect.either
    );

    if (Either.isLeft(result)) {
      const error = result.left;
      yield* _(
        Effect.logError(`Could not decode protobuf
        Cause: ${error.cause}
        Message: ${error.message}
      `)
      );
      return null;
    }

    return result.right;
  });
}

function decodeEdit(data: Buffer): Effect.Effect<DecodedEdit | null> {
  return Effect.gen(function* (_) {
    const decodeEffect = decode(() => {
      const edit = Edit.fromBinary(data);
      const parseResult = ZodEdit.safeParse(edit);

      if (parseResult.success) {
        return parseResult.data;
      }

      return null;
    });

    return yield* _(decodeEffect);
  });
}
