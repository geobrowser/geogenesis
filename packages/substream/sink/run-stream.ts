import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { Effect, Stream } from 'effect';
import * as db from 'zapatos/db';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { populateWithFullEntries } from './entries/populate-entries';
import { parseValidActionsForFullEntries } from './parse-valid-full-entries';
import { upsertCachedEntries, upsertCachedRoles } from './populate-from-cache';
import { getEditorsGrantedV2Effect, handleRoleGranted, handleRoleRevoked } from './populate-roles';
import { groupProposalsByType, mapContentProposalsToSchema } from './proposals/map-proposals';
import { mapGovernanceToSpaces, mapSpaces } from './spaces/map-spaces';
import { createSink, createStream } from './substreams.js/sink/src';
import { slog } from './utils';
import { getChecksumAddress } from './utils/get-checksum-address';
import { invariant } from './utils/invariant';
import { getEntryWithIpfsContent, getProposalFromMetadata } from './utils/ipfs';
import { pool } from './utils/pool';
import {
  type ContentProposal,
  type FullEntry,
  type MembershipProposal,
  type Proposal,
  type SubspaceProposal,
  ZodEditorsAddedStreamResponse,
  ZodEntryStreamResponse,
  ZodGovernancePluginsCreatedStreamResponse,
  ZodProposalStreamResponse,
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

export class CouldNotWriteProposalsError extends Error {
  _tag: 'CouldNotWriteProposalsError' = 'CouldNotWriteProposalsError';
}

interface StreamConfig {
  startBlockNumber?: number;
  // We pass in this flag as it might change depending on the execution state of the stream.
  // If the stream has crashed we need to make sure that we fall back to the cursor.
  shouldUseCursor: boolean;
}

export function runStream({ startBlockNumber, shouldUseCursor }: StreamConfig) {
  return Effect.gen(function* (_) {
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

    /**
     * @HACK: Ticks in the stream might process out-of-order if any of the ticks take
     * longer than subsequent ticks to execute. This is problematic as Geo relies on
     * data being processed linearly to correctly build the knowledge graph state over
     * time.
     *
     * We create a "Queue" using promise chaining to ensure that ticks are processed
     * in the order that they come in. This is a giant hack and can destroy performance
     * in JS.
     *
     * Soon (as of January 23, 2024) we'll migrate to a Queue implementation using Effect's
     * Queue. This will allow us to queue up the DB writes necessary for a given tick and
     * execute them in a more reasonable manner.
     */
    let entriesQueue = Promise.resolve();

    const sink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const cursor = message.cursor;
          const blockNumber = Number(message.clock?.number.toString());
          const timestamp = Number(message.clock?.timestamp?.seconds.toString());

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
          console.log('@BLOCK ', blockNumber, jsonOutput);

          const entryResponse = ZodEntryStreamResponse.safeParse(jsonOutput);
          const roleChangeResponse = ZodRoleChangeStreamResponse.safeParse(jsonOutput);
          const spacePluginCreatedResponse = ZodSpacePluginCreatedStreamResponse.safeParse(jsonOutput);
          const governancePluginsCreatedResponse = ZodGovernancePluginsCreatedStreamResponse.safeParse(jsonOutput);
          const editorsAddedResponse = ZodEditorsAddedStreamResponse.safeParse(jsonOutput);
          const proposalResponse = ZodProposalStreamResponse.safeParse(jsonOutput);

          /**
           * @TODO: De-duplicate any spaces being added with both the space plugin governance
           * plugins. This can likely happen when we refactor to a real queue implementation
           * which has better aggregation->write separation and performance.
           *
           * Right now we have a lot of blocking writes to the DB, as we separate writing to the
           * DB based on the type of event that we're reacting to. `populateEntries` also has
           * quite a few serially blocking calls.
           *
           * We want to move to a Queue implementation instead of the hacky Promise queue that
           * we currently have. This switch will give us a better opportunity to aggregate _all_
           * the changes happening as part of a single block and then write them more efficiently.
           *
           * With the new governance contracts (as of January 23, 2024) we will be indexing _many_
           * more events, so we'll need a more scalable way to handle async writes to the DB so
           * indexing time doesn't balloon.
           */
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

          /**
           * The data model for DAO-based spaces works slightly differently than in legacy spaces.
           * This means there will be a period where we need to support both data models depending
           * on which space/contract we are working with. Eventually these data models will be merged
           * and usage of the legacy space contracts will be migrated to the DAO-based contracts, but
           * for now we are appending "V2" to permissions data models to denote it's used for the
           * DAO-based spaces.
           */
          if (editorsAddedResponse.success) {
            slog({
              requestId: message.cursor,
              message: `Writing editor role for accounts ${editorsAddedResponse.data.editorsAdded
                .map(e => e.addresses)
                .join(', ')} to space with plugin ${editorsAddedResponse.data.editorsAdded.map(
                e => e.pluginAddress
              )} to DB`,
            });

            yield* _(
              getEditorsGrantedV2Effect({
                editorsAdded: editorsAddedResponse.data.editorsAdded,
                blockNumber,
                timestamp,
              })
            );

            slog({
              requestId: message.cursor,
              message: `Editor roles written successfully`,
            });
          }

          if (proposalResponse.success) {
            slog({
              requestId: message.cursor,
              message: `Processing ${proposalResponse.data.proposalsCreated.length} proposals`,
            });

            slog({
              requestId: message.cursor,
              message: `Gathering IPFS content for ${proposalResponse.data.proposalsCreated.length} entries`,
            });

            const maybeProposals = yield* _(
              Effect.all(
                proposalResponse.data.proposalsCreated.map(proposal => getProposalFromMetadata(proposal)),
                {
                  concurrency: 20,
                }
              )
            );

            const proposals = maybeProposals.filter(
              (maybeProposal): maybeProposal is ContentProposal | SubspaceProposal | MembershipProposal =>
                maybeProposal !== null
            );

            const { contentProposals } = groupProposalsByType(proposals);
            const schemaContentProposals = yield* _(mapContentProposalsToSchema(contentProposals, blockNumber, cursor));
            console.log('schema content proposals', schemaContentProposals);

            slog({
              requestId: message.cursor,
              message: `Writing ${contentProposals.length} proposals to DB`,
            });

            // @TODO: Put this in a transaction
            yield* _(
              Effect.tryPromise({
                try: async () => {
                  // @TODO: Batch since there might be postgres byte limits. See upsertChunked
                  await Promise.all([
                    db.upsert('proposals', schemaContentProposals.proposals, ['id']).run(pool),
                    db.upsert('proposed_versions', schemaContentProposals.proposedVersions, ['id']).run(pool),
                    db.upsert('actions', schemaContentProposals.actions, ['id']).run(pool),
                  ]);
                },
                catch: error => new CouldNotWriteProposalsError(String(error)),
              })
            );
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

            const validFullEntries = parseValidActionsForFullEntries(nonValidatedFullEntries);

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

            /**
             * @HACK: Ticks in the stream might process out-of-order if any of the ticks take
             * longer than subsequent ticks to execute. This is problematic as Geo relies on
             * data being processed linearly to correctly build the knowledge graph state over
             * time.
             *
             * We create a "Queue" using promise chaining to ensure that ticks are processed
             * in the order that they come in. This is a giant hack and can destroy performance
             * in JS.
             *
             * Soon (as of January 23, 2024) we'll migrate to a Queue implementation using Effect's
             * Queue. This will allow us to queue up the DB writes necessary for a given tick and
             * execute them in a more reasonable manner.
             */
            entriesQueue = entriesQueue.then(() => {
              /**
               * @TODO: This should write all of the actions we need to take to an Effect.Queue
               * The Effect.Queue will process each action in a separate process. This also lets
               * us do all the DB writes for _all_ events at once instead of separating them out
               * based on the event type.
               */
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
}
