import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { Effect, Stream } from 'effect';

import { MANIFEST, START_BLOCK } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { parseValidFullEntries } from './parse-valid-full-entries';
import { populateWithFullEntries } from './populate-entries';
import { upsertCachedEntries, upsertCachedRoles } from './populate-from-cache';
import { handleRoleGranted, handleRoleRevoked } from './populate-roles';
import { createSink, createStream } from './substreams.js/sink/src';
import { invariant } from './utils/invariant';
import { getEntryWithIpfsContent } from './utils/ipfs';
import { logger } from './utils/logger';
import { type FullEntry, ZodEntryStreamResponse, ZodRoleChangeStreamResponse } from './zod';

export class InvalidPackageError extends Error {
  _tag: 'InvalidPackageError' = 'InvalidPackageError';
}

export class CouldNotWriteCursorError extends Error {
  _tag: 'CouldNotWriteCursorError' = 'CouldNotWriteCursorError';
}

export class CouldNotReadCursorError extends Error {
  _tag: 'CouldNotReadCursorError' = 'CouldNotReadCursorError';
}

export class CouldNotWriteCachedEntryError extends Error {
  _tag: 'CouldNotWriteCachedEntryError' = 'CouldNotWriteCachedEntryError';
}

export class CouldNotWriteCachedRoleError extends Error {
  _tag: 'CouldNotWriteCachedRoleError' = 'CouldNotWriteCachedRoleError';
}

export function getStreamEffect(startBlockNum?: number) {
  const program = Effect.gen(function* (_) {
    const substreamsEndpoint = process.env.SUBSTREAMS_ENDPOINT;
    invariant(substreamsEndpoint, 'SUBSTREAMS_ENDPOINT is required');
    const substreamsApiKey = process.env.SUBSTREAMS_API_KEY;
    invariant(substreamsApiKey, 'SUBSTREAMS_API_KEY is required');
    const authIssueUrl = process.env.AUTH_ISSUE_URL;
    invariant(authIssueUrl, 'AUTH_ISSUE_URL is required');

    logger.enable('pretty');
    logger.info('Logging enabled');

    const substreamPackage = readPackageFromFile(MANIFEST);

    logger.info('Substream package downloaded');

    const { token } = yield* _(
      Effect.tryPromise({
        try: () => authIssue(substreamsApiKey, authIssueUrl),
        catch: error => new InvalidPackageError(`Could not read package at path ${MANIFEST} ${String(error)}`),
      })
    );

    const outputModule = 'geo_out';
    const productionMode = true;

    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: error => new CouldNotReadCursorError(String(error)),
      })
    );

    const registry = createRegistry(substreamPackage);

    const transport = createGrpcTransport({
      baseUrl: substreamsEndpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    console.log('cursor', startCursor);

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule,
      productionMode,
      // @TODO: Move cursor and block number up to top level.
      // This will let us pass either the start block _or_ the start cursor
      // but not both.
      startCursor: startCursor ? startCursor : undefined,
      startBlockNum: startCursor ? undefined : startBlockNum ?? START_BLOCK,
    });

    let entriesQueue = Promise.resolve();

    const sink = createSink({
      handleBlockScopedData: message =>
        Effect.gen(function* (_) {
          const cursor = message.cursor;
          const blockNumber = Number(message.clock?.number.toString());
          const timestamp = Number(message.clock?.timestamp?.seconds.toString());

          // Skipping a massive block for now
          if (message.clock?.number.toString() === '36472865') {
            return;
          }

          if (blockNumber % 1000 === 0) {
            console.log(`@ Block ${blockNumber}`);
          }

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(cursor, blockNumber),
              catch: () => new CouldNotWriteCursorError(),
            })
          );

          const mapOutput = message.output?.mapOutput;

          if (!mapOutput || mapOutput?.value?.byteLength === 0) {
            return;
          }

          const unpackedOutput = mapOutput.unpack(registry);

          // @TODO: Error handling with effect
          if (!unpackedOutput) {
            console.error('Failed to unpack substream message', mapOutput);
            return;
          }

          const jsonOutput = unpackedOutput.toJson({ typeRegistry: registry });

          const entryResponse = ZodEntryStreamResponse.safeParse(jsonOutput);
          const roleChangeResponse = ZodRoleChangeStreamResponse.safeParse(jsonOutput);

          if (entryResponse.success) {
            console.log('Processing ', entryResponse.data.entries.length, ' entries');

            const entries = entryResponse.data.entries;

            const maybeEntriesWithIpfsContent: (FullEntry | null)[] = yield* _(
              Effect.all(
                entries.map(entry => getEntryWithIpfsContent(entry)),
                {
                  concurrency: 20,
                }
              )
            );

            const nonValidatedFullEntries = maybeEntriesWithIpfsContent.filter(
              (maybeFullEntry): maybeFullEntry is FullEntry => maybeFullEntry !== null
            );

            const validFullEntries = parseValidFullEntries(nonValidatedFullEntries);

            yield* _(
              Effect.tryPromise({
                try: () =>
                  upsertCachedEntries({
                    fullEntries: validFullEntries,
                    blockNumber,
                    cursor,
                    timestamp,
                  }),
                catch: error =>
                  new CouldNotWriteCachedEntryError(
                    `Could not upsert cached entries in block ${blockNumber} ${String(error)}}`
                  ),
              })
            );

            // @TODO: This should write all of the actions we need to take to an Effect.Queue
            // The Effect.Queue will process each action in a separate process
            entriesQueue = entriesQueue.then(() => {
              return populateWithFullEntries({
                fullEntries: validFullEntries,
                blockNumber,
                cursor,
                timestamp,
              });
            });
          }

          if (roleChangeResponse.success) {
            console.log('Processing ', roleChangeResponse.data.roleChanges.length, ' role changes');

            for (const roleChange of roleChangeResponse.data.roleChanges) {
              const { granted, revoked } = roleChange;

              if (granted) {
                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      upsertCachedRoles({
                        roleChange: granted,
                        blockNumber,
                        cursor,
                        type: 'GRANTED',
                        timestamp,
                      }),
                    catch: error =>
                      new CouldNotWriteCachedRoleError(
                        `Could not upsert cached granted role in block ${blockNumber} ${String(error)}}`
                      ),
                  })
                );

                handleRoleGranted({
                  roleGranted: granted,
                  blockNumber,
                  timestamp,
                });
              }

              if (revoked) {
                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      upsertCachedRoles({
                        roleChange: revoked,
                        blockNumber,
                        cursor,
                        type: 'REVOKED',
                        timestamp,
                      }),
                    catch: error =>
                      new CouldNotWriteCachedRoleError(
                        `Could not upsert cached revoked role in block ${blockNumber} ${String(error)}}`
                      ),
                  })
                );

                handleRoleRevoked({
                  roleRevoked: revoked,
                });
              }
            }
          }

          if (!entryResponse.success && !roleChangeResponse.success) {
            console.error('Failed to parse substream message', unpackedOutput);
          }
        }),
      handleBlockUndoSignal: message =>
        Effect.gen(function* (_) {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(message.lastValidCursor, blockNumber),
              catch: error => new CouldNotWriteCursorError(String(error)),
            })
          );
        }),
    });

    return yield* _(Stream.run(stream, sink));
  });

  return program;
}
