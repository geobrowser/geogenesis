import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Effect, Stream } from 'effect';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { handleEditorsAdded } from './events/editors-added/handler';
import { ZodEditorsAddedStreamResponse } from './events/editors-added/parser';
import { getInitialProposalsForSpaces } from './events/initial-proposal-created/get-initial-proposals';
import { handleInitialProposalsCreated } from './events/initial-proposal-created/handler';
import { handleMembersApproved } from './events/members-approved/handler';
import { ZodMembersApprovedStreamResponse } from './events/members-approved/parser';
import { handleOnchainProfilesRegistered } from './events/onchain-profiles-registered/handler';
import { ZodOnchainProfilesRegisteredStreamResponse } from './events/onchain-profiles-registered/parser';
import { getContentProposalFromProcessedProposalIpfsUri } from './events/proposal-processed/get-content-proposal-from-processed-proposal';
import { handleProposalsProcessed } from './events/proposal-processed/handler';
import { handleProposalsCreated } from './events/proposals-created/handler';
import {
  ZodProposalCreatedStreamResponse,
  ZodProposalProcessedStreamResponse,
} from './events/proposals-created/parser';
import { handleProposalsExecuted } from './events/proposals-executed/handler';
import { ZodProposalExecutedStreamResponse } from './events/proposals-executed/parser';
import { handleGovernancePluginCreated, handleSpacesCreated } from './events/spaces-created/handler';
import {
  ZodGovernancePluginsCreatedStreamResponse,
  ZodSpacePluginCreatedStreamResponse,
} from './events/spaces-created/parser';
import { handleSubspacesAdded } from './events/subspaces-added/handler';
import { ZodSubspacesAddedStreamResponse } from './events/subspaces-added/parser';
import { handleSubspacesRemoved } from './events/subspaces-removed/handler';
import { ZodSubspacesRemovedStreamResponse } from './events/subspaces-removed/parser';
import { handleVotesCast } from './events/votes-cast/handler';
import { ZodVotesCastStreamResponse } from './events/votes-cast/parser';
import { Telemetry } from './telemetry/telemetry';
import { createGeoId } from './utils/create-geo-id';
import { invariant } from './utils/invariant';
import { slog } from './utils/slog';

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
          const subspacesAdded = ZodSubspacesAddedStreamResponse.safeParse(jsonOutput);
          const subspacesRemoved = ZodSubspacesRemovedStreamResponse.safeParse(jsonOutput);
          const editorsAddedResponse = ZodEditorsAddedStreamResponse.safeParse(jsonOutput);
          const proposalCreatedResponse = ZodProposalCreatedStreamResponse.safeParse(jsonOutput);
          const proposalProcessedResponse = ZodProposalProcessedStreamResponse.safeParse(jsonOutput);
          const votesCast = ZodVotesCastStreamResponse.safeParse(jsonOutput);
          const profilesRegistered = ZodOnchainProfilesRegisteredStreamResponse.safeParse(jsonOutput);
          const executedProposals = ZodProposalExecutedStreamResponse.safeParse(jsonOutput);
          const membersApproved = ZodMembersApprovedStreamResponse.safeParse(jsonOutput);

          if (profilesRegistered.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

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
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleSpacesCreated(spacePluginCreatedResponse.data.spacesCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (governancePluginsCreatedResponse.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

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
            console.log('==================== @BLOCK', blockNumber, '====================');

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
            console.log('==================== @BLOCK', blockNumber, '====================');

            yield* _(
              handleSubspacesRemoved(subspacesRemoved.data.subspacesRemoved, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (editorsAddedResponse.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleEditorsAdded(editorsAddedResponse.data.editorsAdded, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (proposalCreatedResponse.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleProposalsCreated(proposalCreatedResponse.data.proposalsCreated, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (proposalProcessedResponse.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            // Since there are potentially two handlers that we need to run, we abstract out the common
            // data fetching needed for both here, and pass the result to the two handlers. This breaks
            // from the normalized pattern where we have a single handler for every event. For this event
            // there might be two handlers.
            const proposals = yield* _(
              getContentProposalFromProcessedProposalIpfsUri(proposalProcessedResponse.data.proposalsProcessed, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );

            /**
             * If we have a set of "SpacePluginCreated" events in the same block as a set of "ProposalProcessed" events
             * we need to check if any of the processed proposals are because an initial content IPFS URI was passed
             * during space creation.
             *
             * If there are processed proposals as a result of an initial content uri, we need to create the appropriate
             * proposals, proposed versions, actions, etc. before we actually set the proposal as "ACCEPTED"
             */
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

          if (membersApproved.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleMembersApproved(membersApproved.data.membersApproved, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (executedProposals.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleProposalsExecuted(executedProposals.data.executedProposals, {
                blockNumber,
                cursor,
                timestamp,
                requestId,
              })
            );
          }

          if (votesCast.success) {
            console.info(`==================== @BLOCK ${blockNumber} ====================`);

            yield* _(
              handleVotesCast(votesCast.data.votesCast, {
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
