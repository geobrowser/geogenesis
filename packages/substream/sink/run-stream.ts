import { createGrpcTransport } from '@connectrpc/connect-node';
import { createGeoId } from '@geogenesis/sdk';
import { NETWORK_IDS } from '@geogenesis/sdk/src/system-ids';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { Effect, Secret, Stream } from 'effect';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { Environment } from './environment';
import { handleEditorsAdded } from './events/editor-added/handler';
import { ZodEditorAddedStreamResponse } from './events/editor-added/parser';
import { getDerivedSpaceIdsFromImportedSpaces } from './events/get-derived-space-ids-from-imported-spaces';
import { handleNewGeoBlock } from './events/handle-new-geo-block';
import {
  handleInitialGovernanceSpaceEditorsAdded,
  handleInitialPersonalSpaceEditorsAdded,
} from './events/initial-editors-added/handler';
import { type InitialEditorsAdded, ZodInitialEditorsAddedStreamResponse } from './events/initial-editors-added/parser';
import { getInitialProposalsForSpaces } from './events/initial-proposal-created/get-initial-proposals';
import { handleInitialProposalsCreated } from './events/initial-proposal-created/handler';
import { handleMemberAdded } from './events/member-added/handler';
import { ZodMemberAddedStreamResponse } from './events/member-added/parser';
import { handleOnchainProfilesRegistered } from './events/onchain-profiles-registered/handler';
import { ZodOnchainProfilesRegisteredStreamResponse } from './events/onchain-profiles-registered/parser';
import { getProposalFromInitialSpaceProposalIpfsUri } from './events/proposal-processed/get-edits-proposal-from-processed-proposal';
import { handleProposalsProcessed } from './events/proposal-processed/handler';
import { handleProposalsCreated } from './events/proposals-created/handler';
import {
  ZodProposalCreatedStreamResponse,
  ZodProposalProcessedStreamResponse,
} from './events/proposals-created/parser';
import { handleProposalsExecuted } from './events/proposals-executed/handler';
import { ZodProposalExecutedStreamResponse } from './events/proposals-executed/parser';
import { getSpacesWithInitialProposalsProcessed } from './events/spaces-created/get-spaces-with-initial-proposals-processed';
import {
  handleGovernancePluginCreated,
  handlePersonalSpacesCreated,
  handleSpacesCreated,
} from './events/spaces-created/handler';
import {
  ZodGovernancePluginsCreatedStreamResponse,
  ZodPersonalPluginsCreatedStreamResponse,
  ZodSpacePluginCreatedStreamResponse,
} from './events/spaces-created/parser';
import { handleSubspacesAdded } from './events/subspaces-added/handler';
import { ZodSubspacesAddedStreamResponse } from './events/subspaces-added/parser';
import { handleSubspacesRemoved } from './events/subspaces-removed/handler';
import { ZodSubspacesRemovedStreamResponse } from './events/subspaces-removed/parser';
import { handleVotesCast } from './events/votes-cast/handler';
import { ZodVotesCastStreamResponse } from './events/votes-cast/parser';
import { Telemetry } from './telemetry';
import { slog } from './utils/slog';
import { createSink, createStream } from './vendor/sink/src';

export class InvalidPackageError extends Error {
  _tag: 'InvalidPackageError' = 'InvalidPackageError';
}

export class CouldNotWriteCursorError extends Error {
  _tag: 'CouldNotWriteCursorError' = 'CouldNotWriteCursorError';
}

export class InvalidStreamConfigurationError extends Error {
  _tag: 'InvalidStreamConfigurationError' = 'InvalidStreamConfigurationError';
}

export class CouldNotReadCursorError extends Error {
  _tag: 'CouldNotReadCursorError' = 'CouldNotReadCursorError';
}

export class CouldNotWriteProposalsError extends Error {
  _tag: 'CouldNotWriteProposalsError' = 'CouldNotWriteProposalsError';
}

export class CouldNotWriteVotesError extends Error {
  _tag: 'CouldNotWriteVotesError' = 'CouldNotWriteVotesError';
}

interface StreamConfig {
  startBlockNumber?: number;
  // We pass in this flag as it might change depending on the execution state of the stream.
  // If the stream has crashed we need to make sure that we fall back to the cursor.
  shouldUseCursor: boolean;
}

export function runStream({ startBlockNumber, shouldUseCursor }: StreamConfig) {
  return Effect.gen(function* (_) {
    const environment = yield* _(Environment);

    const startCursor = yield* _(
      Effect.tryPromise({
        try: () => readCursor(),
        catch: error => new CouldNotReadCursorError(String(error)),
      })
    );

    if (!startBlockNumber && !startCursor) {
      yield* _(Effect.fail(new InvalidStreamConfigurationError('Either startBlockNumber or startCursor is required')));
    }

    const substreamPackage = readPackageFromFile(MANIFEST);
    console.info(`Using substream package ${MANIFEST}`);

    const { token } = yield* _(
      Effect.tryPromise({
        try: () => authIssue(Secret.value(environment.apiKey), environment.authIssueUrl),
        catch: error => new InvalidPackageError(`Could not read package at path ${MANIFEST} ${String(error)}`),
      })
    );

    const registry = createRegistry(substreamPackage);

    const transport = createGrpcTransport({
      baseUrl: environment.endpoint,
      httpVersion: '2',
      interceptors: [createAuthInterceptor(token)],
    });

    const stream = createStream({
      connectTransport: transport,
      substreamPackage,
      outputModule: 'geo_out',
      productionMode: false,
      // The caller determines which block or cursor to start from based on
      // error handling, CLI flags, cache state, etc. We default to cursor
      // if it exists or start from the passed in block if not.
      startCursor: shouldUseCursor ? startCursor : undefined,
      startBlockNum: shouldUseCursor ? undefined : startBlockNumber,
      // The stream will retry recoverable errors for 10 minutes
      // internally. This has no effect on unrecoverable errors.
      maxRetrySeconds: 600, // 10 minutes.
    });

    const sink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const requestId = createGeoId();
          const telemetry = yield* _(Telemetry);
          const cursor = message.cursor;
          const blockNumber = Number(message.clock?.number.toString());
          const timestamp = Number(message.clock?.timestamp?.seconds.toString());

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(cursor, blockNumber),
              catch: () => new CouldNotWriteCursorError(),
            })
          );

          if (blockNumber % 1000 === 0) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);
          }

          const mapOutput = message.output?.mapOutput;

          if (!mapOutput || mapOutput?.value?.byteLength === 0) {
            return;
          }

          const unpackedOutput = mapOutput.unpack(registry);

          if (!unpackedOutput) {
            slog({
              requestId,
              level: 'error',
              message: `Failed to unpack substream message: ${mapOutput}`,
            });

            telemetry.captureMessage(`Failed to unpack substream message: ${mapOutput}`);

            return;
          }

          const jsonOutput = unpackedOutput.toJson({ typeRegistry: registry });

          const spacePluginCreatedResponse = ZodSpacePluginCreatedStreamResponse.safeParse(jsonOutput);
          const governancePluginsCreatedResponse = ZodGovernancePluginsCreatedStreamResponse.safeParse(jsonOutput);
          const personalPluginsCreated = ZodPersonalPluginsCreatedStreamResponse.safeParse(jsonOutput);
          const subspacesAdded = ZodSubspacesAddedStreamResponse.safeParse(jsonOutput);
          const subspacesRemoved = ZodSubspacesRemovedStreamResponse.safeParse(jsonOutput);
          const initialEditorsAddedResponse = ZodInitialEditorsAddedStreamResponse.safeParse(jsonOutput);
          const proposalCreatedResponse = ZodProposalCreatedStreamResponse.safeParse(jsonOutput);
          const proposalProcessedResponse = ZodProposalProcessedStreamResponse.safeParse(jsonOutput);
          const votesCast = ZodVotesCastStreamResponse.safeParse(jsonOutput);
          const profilesRegistered = ZodOnchainProfilesRegisteredStreamResponse.safeParse(jsonOutput);
          const executedProposals = ZodProposalExecutedStreamResponse.safeParse(jsonOutput);
          const membersAdded = ZodMemberAddedStreamResponse.safeParse(jsonOutput);
          // members removed
          const editorsAdded = ZodEditorAddedStreamResponse.safeParse(jsonOutput);
          // editors removed

          const hasValidEvent =
            spacePluginCreatedResponse.success ||
            governancePluginsCreatedResponse.success ||
            personalPluginsCreated ||
            subspacesAdded.success ||
            subspacesRemoved.success ||
            initialEditorsAddedResponse.success ||
            proposalCreatedResponse.success ||
            proposalProcessedResponse.success ||
            votesCast.success ||
            profilesRegistered.success ||
            executedProposals.success ||
            membersAdded.success ||
            editorsAdded.success;

          if (hasValidEvent) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            const block = yield* _(
              handleNewGeoBlock({
                blockNumber,
                cursor,
                requestId,
                timestamp,
                hash: message.clock?.id ?? '',
                network: NETWORK_IDS.GEO,
              })
            );
          }

          if (profilesRegistered.success) {
            yield* _(
              handleOnchainProfilesRegistered(profilesRegistered.data.profilesRegistered, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          let createdSpaceIds: string[] | null = null;

          if (spacePluginCreatedResponse.success) {
            /**
             * A space's id is derived from the contract address of the DAO and the network the DAO is deployed to.
             * Users can import or fork a space from any network and import the contents of the original space into
             * the new one that they're creating.
             *
             * If they are importing a space, for example from another chain, we want to keep the ids for the
             * space consistent. This means that when creating a space we need to check if it is has a firstContentUri
             * that contains an `IMPORT_SPACE` ActionType. If it does, then we know we're importing a space that
             * should use the contents of the import to derive the id. If not, it's a brand new space that has never
             * existed in the knowledge graph, so we can create the id based on the new space's address and network.
             *
             * 1. Check to see which proposals map to spaces created
             * 2. See if any of the proposals are an import
             * 3. If they are an import then return the imported space id
             * 4. If there is no import for this space with imported space id then use the normal id creation
             *    flow. If we are forking a space then this flow applies, but there will be no previous space
             *    metadata most likely. It will also have a different IPFS ActionType type.
             *
             * @TODO(optimization):
             * We do something similar when processing a proposal as well to see if the proposal is part of initial
             * space creation. This is somewhat the inverse, where we check to see if a proposal is part of space
             * creation because we need data from the proposal to create the space.
             *
             * It might make sense to do the proposal creation here instead of in proposalProcessed. That way all
             * of this logic for checking proposals happens in the same place.
             */
            if (proposalProcessedResponse.success) {
              const spacesWithInitialProposal = getSpacesWithInitialProposalsProcessed(
                spacePluginCreatedResponse.data.spacesCreated,
                proposalProcessedResponse.data.proposalsProcessed
              );

              const spacePluginAddressesWithInitialProposal = new Set(
                spacesWithInitialProposal.map(s => s.spaceAddress)
              );

              const initialProposalsForSpaces = proposalProcessedResponse.data.proposalsProcessed.filter(p =>
                spacePluginAddressesWithInitialProposal.has(p.pluginAddress)
              );

              const proposalsWithInitialSpaceIds = yield* _(
                getDerivedSpaceIdsFromImportedSpaces(initialProposalsForSpaces, {
                  blockNumber,
                  cursor,
                  requestId,
                  timestamp,
                })
              );

              const initialSpaceIdsByPluginAddress = proposalsWithInitialSpaceIds.reduce((acc, p) => {
                acc.set(p.pluginAddress, p.spaceId);
                return acc;
              }, new Map<string, string | null>());

              const spacesCreated = spacePluginCreatedResponse.data.spacesCreated.map(s => {
                return {
                  id: initialSpaceIdsByPluginAddress.get(s.spaceAddress) ?? null,
                  daoAddress: s.daoAddress,
                  spaceAddress: s.spaceAddress,
                };
              });

              createdSpaceIds = yield* _(
                handleSpacesCreated(spacesCreated, {
                  blockNumber,
                  cursor,
                  timestamp,
                  requestId,
                })
              );
            } else {
              createdSpaceIds = yield* _(
                handleSpacesCreated(spacePluginCreatedResponse.data.spacesCreated, {
                  blockNumber,
                  cursor,
                  timestamp,
                  requestId,
                })
              );
            }
          }

          if (personalPluginsCreated.success) {
            yield* _(
              handlePersonalSpacesCreated(personalPluginsCreated.data.personalPluginsCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );

            // We want to map the initial editors across spaces fairly similarly. Unfortunately
            // the contracts are distinct enough where they don't match 1:1 with how they
            // emit the initial editor information. We do our best here to map them to use
            // mostly the same event handler for both.
            //
            // The main difference is that we handle writing the editors for personal spaces
            // at the same time as we write the space itself rather than doing it in its
            // own unique event like we do for governance spaces.
            //
            // Order matters here so we need to make sure we cwrite the plugin before we write
            // the editors.
            const initialEditors: InitialEditorsAdded[] = personalPluginsCreated.data.personalPluginsCreated.map(p => {
              return {
                pluginAddress: p.personalAdminAddress,
                addresses: [p.initialEditor],
              };
            });

            yield* _(
              handleInitialPersonalSpaceEditorsAdded(initialEditors, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (governancePluginsCreatedResponse.success) {
            yield* _(
              handleGovernancePluginCreated(governancePluginsCreatedResponse.data.governancePluginsCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (subspacesAdded.success) {
            yield* _(
              handleSubspacesAdded(subspacesAdded.data.subspacesAdded, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (subspacesRemoved.success) {
            yield* _(
              handleSubspacesRemoved(subspacesRemoved.data.subspacesRemoved, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (initialEditorsAddedResponse.success) {
            yield* _(
              handleInitialGovernanceSpaceEditorsAdded(initialEditorsAddedResponse.data.initialEditorsAdded, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (proposalCreatedResponse.success) {
            yield* _(
              handleProposalsCreated(proposalCreatedResponse.data.proposalsCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          /**
           * If we have a set of "SpacePluginCreated" events in the same block as a set of "ProposalProcessed" events
           * we need to check if any of the processed proposals are because an initial content IPFS URI was passed
           * during space creation.
           *
           * If there are processed proposals as a result of an initial content uri, we need to create the appropriate
           * proposals, proposed versions, actions, etc. before we actually set the proposal as "ACCEPTED"
           */
          if (proposalProcessedResponse.success) {
            /**
             * Since there are potentially three handlers that we need to run, we abstract out the common
             * data fetching needed for both here, and pass the result to the two handlers. This breaks
             * from the normalized pattern where we have a single handler for every event. For this event
             * there might be two handlers.
             *
             * `getProposalFromInitialSpaceProposalIpfsUri` might be an Edit or it might be an Import which
             * contains many edits
             */
            const proposals = yield* _(
              getProposalFromInitialSpaceProposalIpfsUri(proposalProcessedResponse.data.proposalsProcessed, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );

            /**
             * We track the spaces that were created in this block and check if any of the proposals executed
             * are from a created space. If they _are_ we need to create proposals for them before we can
             * actually execute the proposal.
             */
            if (createdSpaceIds) {
              const initialProposalsToWrite = getInitialProposalsForSpaces(createdSpaceIds, proposals);

              yield* _(
                handleInitialProposalsCreated(initialProposalsToWrite, {
                  blockNumber,
                  cursor,
                  timestamp,
                  requestId,
                })
              );
            }

            yield* _(
              handleProposalsProcessed(proposals, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (membersAdded.success) {
            yield* _(
              handleMemberAdded(membersAdded.data.membersAdded, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (editorsAdded.success) {
            yield* _(
              handleEditorsAdded(editorsAdded.data.editorsAdded, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (votesCast.success) {
            yield* _(
              handleVotesCast(votesCast.data.votesCast, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (executedProposals.success) {
            yield* _(
              handleProposalsExecuted(executedProposals.data.executedProposals, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
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
