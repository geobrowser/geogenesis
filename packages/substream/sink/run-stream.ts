import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { Effect, Stream } from 'effect';
import * as db from 'zapatos/db';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { populateWithFullEntries } from './entries/populate-entries';
import { parseValidFullEntries } from './parse-valid-full-entries';
import { upsertCachedEntries, upsertCachedRoles } from './populate-from-cache';
import { handleRoleGranted, handleRoleRevoked } from './populate-roles';
import { mapGovernanceToSpaces, mapSpaces } from './spaces/map-spaces';
import { createSink, createStream } from './substreams.js/sink/src';
import { slog } from './utils';
import { getChecksumAddress } from './utils/get-checksum-address';
import { invariant } from './utils/invariant';
import { getEntryWithIpfsContent } from './utils/ipfs';
import { pool } from './utils/pool';
import {
  type FullEntry,
  ZodEntryStreamResponse,
  ZodGovernancePluginsCreatedStreamResponse,
  ZodRoleChangeStreamResponse,
  ZodSpacePluginCreatedStreamResponse,
} from './zod';

export class InvalidPackageError extends Error {
  _tag: 'InvalidPackageError' = 'InvalidPackageError';
}

export class CouldNotWriteCursorError extends Error {
  _tag: 'CouldNotWriteCursorError' = 'CouldNotWriteCursorError';
}

export class CouldNotWriteCachedEntryError extends Error {
  _tag: 'CouldNotWriteCachedEntryError' = 'CouldNotWriteCachedEntryError';
}

export class CouldNotWriteCachedRoleError extends Error {
  _tag: 'CouldNotWriteCachedRoleError' = 'CouldNotWriteCachedRoleError';
}

export class CouldNotRevokeRoleError extends Error {
  _tag: 'CouldNotRevokeRoleError' = 'CouldNotRevokeRoleError';
}

export class CouldNotGrantRoleError extends Error {
  _tag: 'CouldNotGrantRoleError' = 'CouldNotGrantRoleError';
}

export class InvalidStreamConfigurationError extends Error {
  _tag: 'InvalidStreamConfigurationError' = 'InvalidStreamConfigurationError';
}

export class CouldNotReadCursorError extends Error {
  _tag: 'CouldNotReadCursorError' = 'CouldNotReadCursorError';
}

export class CouldNotWriteSpacesError extends Error {
  _tag: 'CouldNotWriteSpacesError' = 'CouldNotWriteSpacesError';
}

interface StreamConfig {
  startBlockNumber?: number;
  shouldUseCursor: boolean;
}

export function runStream({ startBlockNumber, shouldUseCursor }: StreamConfig) {
  const program = Effect.gen(function* (_) {
    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: error => new CouldNotReadCursorError(String(error)),
      })
    );

    if (!startBlockNumber && !startCursor) {
      yield* _(Effect.fail(new InvalidStreamConfigurationError('Either startBlockNumber or startCursor is required')));
    }

    const substreamsEndpoint = process.env.SUBSTREAMS_ENDPOINT;
    invariant(substreamsEndpoint, 'SUBSTREAMS_ENDPOINT is required');
    const substreamsApiKey = process.env.SUBSTREAMS_API_KEY;
    invariant(substreamsApiKey, 'SUBSTREAMS_API_KEY is required');
    const authIssueUrl = process.env.AUTH_ISSUE_URL;
    invariant(authIssueUrl, 'AUTH_ISSUE_URL is required');

    const substreamPackage = readPackageFromFile(MANIFEST);
    console.info(`Using substream package ${MANIFEST}`);

    const { token } = yield* _(
      Effect.tryPromise({
        try: () => authIssue(substreamsApiKey, authIssueUrl),
        catch: error => new InvalidPackageError(`Could not read package at path ${MANIFEST} ${String(error)}`),
      })
    );

    const registry = createRegistry(substreamPackage);

    const transport = createGrpcTransport({
      baseUrl: substreamsEndpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: true,
      // The caller determines which block or cursor to start from based on
      // error handling, CLI flags, cache state, etc. We default to cursor
      // if it exists or start from the passed in block if not.
      startCursor: shouldUseCursor ? startCursor : undefined,
      startBlockNum: shouldUseCursor ? undefined : startBlockNumber,
      // The stream will retry recoverable errors for 10 minutes
      // internally. This has no effect on unrecoverable errors.
      maxRetrySeconds: 600, // 10 minutes.
    });

    let entriesQueue = Promise.resolve();

    const sink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const cursor = message.cursor;
          const blockNumber = Number(message.clock?.number.toString());
          const timestamp = Number(message.clock?.timestamp?.seconds.toString());

          // Skipping a massive block for now
          if (message.clock?.number.toString() === '36472865') {
            return;
          }

          if (blockNumber % 1000 === 0) {
            slog({
              requestId: message.cursor,
              message: `Processing block ${blockNumber}`,
            });
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
          const spacePluginCreatedResponse = ZodSpacePluginCreatedStreamResponse.safeParse(jsonOutput);
          const governancePluginsCreatedResponse = ZodGovernancePluginsCreatedStreamResponse.safeParse(jsonOutput);

          // @TODO: De-duplicate any spaces being added with both the space plugin governance
          // plugins. This can likely happen when we refactor to a real queue implementation
          // which has better aggregate->write separation and performance.
          //
          // Right now we have a lot of blocking writes to the DB, as we separate writing to the
          // DB based on the type of event that we're reacting to. `populateEntries` also has
          // quite a few serially blocking calls.
          //
          // We want to move to a Queue implementation instead of the hacky Promise queue that
          // we currently have. This switch will give us a better opportunity to aggregate _all_
          // the changes happening as part of a single block and then write them more efficiently.
          //
          // With the new governance contracts (as of January 23, 2024) we will be indexing _many_
          // more events, so we'll need a more scalable way to handle async writes to the DB so
          // indexing time doesn't balloon.
          if (spacePluginCreatedResponse.success) {
            const spaces = mapSpaces(spacePluginCreatedResponse.data.spacesCreated, blockNumber);

            slog({
              requestId: message.cursor,
              message: `Writing ${spaces.length} spaces to DB`,
            });

            yield* _(
              Effect.tryPromise({
                try: async () => {
                  await db.upsert('spaces', spaces, ['id']).run(pool);
                },
                catch: error => new CouldNotWriteSpacesError(String(error)),
              })
            );

            slog({
              requestId: message.cursor,
              message: `Spaces written successfully`,
            });
          }

          if (governancePluginsCreatedResponse.success) {
            const spaces = mapGovernanceToSpaces(
              governancePluginsCreatedResponse.data.governancePluginsCreated,
              blockNumber
            );

            slog({
              requestId: message.cursor,
              message: `Writing ${spaces.length} spaces with governance to DB`,
            });

            yield* _(
              Effect.tryPromise({
                try: async () => {
                  await db.upsert('spaces', spaces, ['id']).run(pool);
                },
                catch: error => new CouldNotWriteSpacesError(String(error)),
              })
            );

            slog({
              requestId: message.cursor,
              message: `Spaces with governance written successfully`,
            });
          }

          if (entryResponse.success) {
            slog({
              requestId: message.cursor,
              message: `Processing ${entryResponse.data.entries.length} entries`,
            });

            const entries = entryResponse.data.entries;

            slog({
              requestId: message.cursor,
              message: `Gathering IPFS content for ${entries.length} entries`,
            });

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

            slog({
              requestId: message.cursor,
              message: `Caching ${entries.length} entries`,
            });
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

            slog({
              requestId: message.cursor,
              message: `Writing ${entries.length} entries to DB`,
            });

            // @TODO: This should write all of the actions we need to take to an Effect.Queue
            // The Effect.Queue will process each action in a separate process. This also lets
            // us do all the DB writes for _all_ events at once instead of separating them out
            // based on the event type.
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
            for (const roleChange of roleChangeResponse.data.roleChanges) {
              const { granted, revoked } = roleChange;

              if (granted) {
                const roleChangeWithChecksum: (typeof roleChange)['granted'] = {
                  ...granted,
                  account: getChecksumAddress(granted.account),
                  sender: getChecksumAddress(granted.sender),
                  space: getChecksumAddress(granted.space),
                };

                slog({
                  requestId: message.cursor,
                  message: `Caching granted role ${JSON.stringify(roleChangeWithChecksum.role)} for account ${
                    roleChangeWithChecksum.account
                  } in space ${roleChangeWithChecksum.space}`,
                });

                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      upsertCachedRoles({
                        roleChange: roleChangeWithChecksum,
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

                slog({
                  requestId: message.cursor,
                  message: `Writing granted role ${JSON.stringify(roleChangeWithChecksum.role)} for account ${
                    roleChangeWithChecksum.account
                  } in space ${roleChangeWithChecksum.space} to DB`,
                });

                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      handleRoleGranted({
                        roleGranted: roleChangeWithChecksum,
                        blockNumber,
                        timestamp,
                      }),
                    catch: error =>
                      new CouldNotGrantRoleError(
                        `Could not handle granted role in block ${blockNumber} ${String(error)}}`
                      ),
                  })
                );

                slog({
                  requestId: message.cursor,
                  message: `Granted role written successfully`,
                });
              }

              if (revoked) {
                const roleChangeWithChecksum: (typeof roleChange)['revoked'] = {
                  ...revoked,
                  account: getChecksumAddress(revoked.account),
                  sender: getChecksumAddress(revoked.sender),
                  space: getChecksumAddress(revoked.space),
                };

                slog({
                  requestId: message.cursor,
                  message: `Caching revoked role ${JSON.stringify(roleChangeWithChecksum.role)} for account ${
                    roleChangeWithChecksum.account
                  } in space ${roleChangeWithChecksum.space}`,
                });

                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      upsertCachedRoles({
                        roleChange: roleChangeWithChecksum,
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

                slog({
                  requestId: message.cursor,
                  message: `Writing revoked role ${JSON.stringify(roleChangeWithChecksum.role)} for account ${
                    roleChangeWithChecksum.account
                  } in space ${roleChangeWithChecksum.space} to DB`,
                });

                yield* _(
                  Effect.tryPromise({
                    try: () =>
                      handleRoleRevoked({
                        roleRevoked: roleChangeWithChecksum,
                        blockNumber,
                      }),
                    catch: error =>
                      new CouldNotRevokeRoleError(
                        `Could not handle revoked role in block ${blockNumber} ${String(error)}}`
                      ),
                  })
                );

                slog({
                  requestId: message.cursor,
                  message: `Revoked role written successfully`,
                });
              }
            }
          }
        });
      },

      handleBlockUndoSignal: message => {
        return Effect.gen(function* (_) {
          const blockNumber = Number(message.lastValidBlock?.number.toString());
          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(message.lastValidCursor, blockNumber),
              catch: error => new CouldNotWriteCursorError(String(error)),
            })
          );
        });
      },
    });

    const runStream = Stream.run(stream, sink);

    return yield* _(runStream);
  });

  return program;
}