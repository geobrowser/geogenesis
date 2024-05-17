import { createGrpcTransport } from '@connectrpc/connect-node';
import { createGeoId } from '@geogenesis/sdk';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { Effect, Secret, Stream } from 'effect';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { Environment } from './environment';
import { handleEditorsAdded } from './events/editor-added/handler';
import { ZodEditorAddedStreamResponse } from './events/editor-added/parser';
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
import { getEditProposalFromInitialSpaceProposalIpfsUri } from './events/proposal-processed/get-edits-proposal-from-processed-proposal';
import { handleProposalsProcessed } from './events/proposal-processed/handler';
import { handleProposalsCreated } from './events/proposals-created/handler';
import {
  ZodProposalCreatedStreamResponse,
  ZodProposalProcessedStreamResponse,
} from './events/proposals-created/parser';
import { handleProposalsExecuted } from './events/proposals-executed/handler';
import { ZodProposalExecutedStreamResponse } from './events/proposals-executed/parser';
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

          if (spacePluginCreatedResponse.success) {
            yield* _(
              handleSpacesCreated(spacePluginCreatedResponse.data.spacesCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
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
             * Since there are potentially two handlers that we need to run, we abstract out the common
             * data fetching needed for both here, and pass the result to the two handlers. This breaks
             * from the normalized pattern where we have a single handler for every event. For this event
             * there might be two handlers.
             */
            const proposals = yield* _(
              getEditProposalFromInitialSpaceProposalIpfsUri(proposalProcessedResponse.data.proposalsProcessed, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );

            if (spacePluginCreatedResponse.success) {
              const initialProposalsToWrite = getInitialProposalsForSpaces(
                spacePluginCreatedResponse.data.spacesCreated,
                proposals
              );

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
