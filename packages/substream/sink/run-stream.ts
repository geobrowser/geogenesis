import type { IMessageTypeRegistry } from '@bufbuild/protobuf';
import { createGrpcTransport } from '@connectrpc/connect-node';
import { getChecksumAddress } from '@geoprotocol/geo-sdk';

import { Id, NetworkIds } from './utils/sdk-compat';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import type { BlockScopedData } from '@substreams/core/proto';
import { readPackageFromFile } from '@substreams/manifest';
import { Data, Duration, Effect, Either, Logger, Secret, Stream } from 'effect';

import { MANIFEST, US_LAW_SPACE } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import { Spaces } from './db';
import { Environment } from './environment';
import { handleEditorsAdded } from './events/editor-added/handler';
import { ZodEditorAddedStreamResponse } from './events/editor-added/parser';
import { handleEditorRemoved } from './events/editor-removed/handler';
import { ZodEditorRemovedStreamResponse } from './events/editor-removed/parser';
import { getEditsProposalsFromIpfsUri } from './events/edits-published/get-edits-proposal-from-processed-proposal';
import { handleEditsPublished } from './events/edits-published/handler';
import { getDerivedSpaceIdsFromImportedSpaces } from './events/get-derived-space-ids-from-imported-spaces';
import { getProposalsForSpaceIds } from './events/get-proposals-for-space-ids';
import { handleNewGeoBlock } from './events/handle-new-geo-block';
import {
  handleInitialGovernanceSpaceEditorsAdded,
  handleInitialPersonalSpaceEditorsAdded,
} from './events/initial-editors-added/handler';
import { type InitialEditorsAdded, ZodInitialEditorsAddedStreamResponse } from './events/initial-editors-added/parser';
import { createInitialContentForSpaces } from './events/initial-proposal-created/handler';
import { handleMemberAdded } from './events/member-added/handler';
import { ZodMemberAddedStreamResponse } from './events/member-added/parser';
import { handleMemberRemoved } from './events/member-removed/handler';
import { ZodMemberRemovedStreamResponse } from './events/member-removed/parser';
import {
  handleEditProposalCreated,
  handleEditorshipProposalsCreated,
  handleMembershipProposalsCreated,
  handleSubspaceProposalsCreated,
} from './events/proposals-created/handler';
import { handleProposalsExecuted } from './events/proposals-executed/handler';
import { ZodProposalExecutedStreamResponse } from './events/proposals-executed/parser';
import { ZodEditPublishedStreamResponse } from './events/schema/edit-published';
import {
  ZodAddEditorProposalStreamResponse,
  ZodAddMemberProposalStreamResponse,
  ZodAddSubspaceProposalStreamResponse,
  ZodEditProposalCreatedStreamResponse,
  ZodRemoveEditorProposalStreamResponse,
  ZodRemoveMemberProposalStreamResponse,
  ZodRemoveSubspaceProposalStreamResponse,
} from './events/schema/proposal';
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
import { LoggerLive, getConfiguredLogLevel, withRequestId } from './logs';
import { Telemetry, TelemetryLive } from './telemetry';
import type { BlockEvent } from './types';
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

class TimeoutError extends Data.TaggedClass('TimeoutError')<{
  readonly message: string;
  readonly cause: unknown;
}> {}

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
      productionMode: true,
      // The caller determines which block or cursor to start from based on
      // error handling, CLI flags, cache state, etc. We default to cursor
      // if it exists or start from the passed in block if not.
      startCursor: shouldUseCursor ? startCursor : undefined,
      // If start cursor should be used but it's undefined then fall back to the block number
      startBlockNum: shouldUseCursor ? (startCursor === undefined ? startBlockNumber : undefined) : startBlockNumber,
      // The stream will retry recoverable errors for 10 minutes
      // internally. This has no effect on unrecoverable errors.
      maxRetrySeconds: 600, // 10 minutes.
    });

    const sink = createSink({
      handleBlockScopedData: message => {
        return Effect.gen(function* (_) {
          const start = Date.now();
          const blockNumber = Number(message.clock?.number.toString());

          const requestId = Id.generate();
          const telemetry = yield* _(Telemetry);
          const logLevel = yield* _(getConfiguredLogLevel);

          // If we get an unrecoverable error (how do we define those)
          // then we don't want to exit the entire handler though, and
          // continue if possible.
          const result = yield* _(
            handleMessage(message, registry).pipe(
              withRequestId(requestId),
              Logger.withMinimumLogLevel(logLevel),
              Effect.provide(LoggerLive),
              // Limit the maximum time a block takes to index to 5 minutes
              Effect.timeout(Duration.minutes(5))
            ),
            Effect.either
          );

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(message.cursor, blockNumber),
              catch: () => new CouldNotWriteCursorError(),
            })
          );

          if (Either.isLeft(result)) {
            const error = result.left;

            if (error._tag === 'TimeoutException') {
              yield* _(Effect.logError('[BLOCK] Timed out after 5 minutes'));
              return;
            }

            telemetry.captureMessage(error.message);
            yield* _(Effect.logError(error.message));
            return;
          }

          const hasValidEvent = result.right;

          if (hasValidEvent) {
            yield* _(
              Effect.logInfo(`[BLOCK] Ended ${blockNumber}`).pipe(
                withRequestId(requestId),
                Logger.withMinimumLogLevel(logLevel),
                Effect.provide(LoggerLive)
              )
            );
          }

          const end = Date.now();
          console.log(`[BLOCK] Ended ${blockNumber} in ${end - start}ms`);
        }).pipe(Effect.provideService(Telemetry, TelemetryLive));
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

    // The stream might time out after a period of time and no longer receive events from
    // the substream endpoint. We timeout the stream with a TimeoutError after 5 minutes.
    // If the caller receives a TimeoutError we restart the stream. Any other error types
    // bubble up to the caller.
    const streamWithTimeout = stream.pipe(
      Stream.timeoutFail(
        () => new TimeoutError({ message: 'Stream timed out after 5 minutes', cause: null }),
        Duration.minutes(5)
      )
    );

    const runStream = Stream.run(streamWithTimeout, sink);
    return yield* _(runStream);
  });
}

function handleMessage(message: BlockScopedData, registry: IMessageTypeRegistry) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    const cursor = message.cursor;
    const blockNumber = Number(message.clock?.number.toString());
    const timestamp = Number(message.clock?.timestamp?.seconds.toString());

    const mapOutput = message.output?.mapOutput;

    if (!mapOutput || mapOutput?.value?.byteLength === 0) {
      return;
    }

    const unpackedOutput = mapOutput.unpack(registry);

    if (!unpackedOutput) {
      const message = `Failed to unpack substream message: ${mapOutput}`;
      telemetry.captureMessage(message);
      yield* _(Effect.logError(message));
      return;
    }

    const jsonOutput = unpackedOutput.toJson({ typeRegistry: registry });

    const spacePluginCreatedResponse = ZodSpacePluginCreatedStreamResponse.safeParse(jsonOutput);
    const governancePluginsCreatedResponse = ZodGovernancePluginsCreatedStreamResponse.safeParse(jsonOutput);
    const personalPluginsCreated = ZodPersonalPluginsCreatedStreamResponse.safeParse(jsonOutput);

    const subspacesAdded = ZodSubspacesAddedStreamResponse.safeParse(jsonOutput);
    const subspacesRemoved = ZodSubspacesRemovedStreamResponse.safeParse(jsonOutput);

    const initialEditorsAddedResponse = ZodInitialEditorsAddedStreamResponse.safeParse(jsonOutput);
    const editorsAdded = ZodEditorAddedStreamResponse.safeParse(jsonOutput);
    const editorsRemoved = ZodEditorRemovedStreamResponse.safeParse(jsonOutput);
    const membersAdded = ZodMemberAddedStreamResponse.safeParse(jsonOutput);
    const membersRemoved = ZodMemberRemovedStreamResponse.safeParse(jsonOutput);

    const editsProposed = ZodEditProposalCreatedStreamResponse.safeParse(jsonOutput);
    const editsPublishedResponse = ZodEditPublishedStreamResponse.safeParse(jsonOutput);

    const addMembersProposed = ZodAddMemberProposalStreamResponse.safeParse(jsonOutput);
    const removeMembersProposed = ZodRemoveMemberProposalStreamResponse.safeParse(jsonOutput);
    const addEditorsProposed = ZodAddEditorProposalStreamResponse.safeParse(jsonOutput);
    const removeEditorsProposed = ZodRemoveEditorProposalStreamResponse.safeParse(jsonOutput);
    const addSubspacesProposed = ZodAddSubspaceProposalStreamResponse.safeParse(jsonOutput);
    const removeSubspacesProposed = ZodRemoveSubspaceProposalStreamResponse.safeParse(jsonOutput);

    const votesCast = ZodVotesCastStreamResponse.safeParse(jsonOutput);
    const executedProposals = ZodProposalExecutedStreamResponse.safeParse(jsonOutput);

    const block: BlockEvent = {
      blockNumber,
      cursor,
      timestamp,
    };

    const hasValidEvent =
      spacePluginCreatedResponse.success ||
      governancePluginsCreatedResponse.success ||
      personalPluginsCreated ||
      subspacesAdded.success ||
      subspacesRemoved.success ||
      initialEditorsAddedResponse.success ||
      editsPublishedResponse.success ||
      votesCast.success ||
      executedProposals.success ||
      membersAdded.success ||
      editorsAdded.success ||
      membersRemoved.success ||
      editorsRemoved.success ||
      editsProposed.success ||
      addMembersProposed.success ||
      removeMembersProposed.success;

    if (hasValidEvent) {
      yield* _(Effect.logInfo(`[BLOCK] Started ${blockNumber}`));

      yield* _(
        Effect.fork(
          handleNewGeoBlock({
            ...block,
            hash: message.clock?.id ?? '',
            network: NetworkIds.GEO,
          })
        )
      );
    }

    let createdSpaceIds: string[] | null = null;

    if (spacePluginCreatedResponse.success) {
      const spaceData = spacePluginCreatedResponse.data.spacesCreated.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );

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
      if (editsPublishedResponse.success) {
        const editData = editsPublishedResponse.data.editsPublished.filter(
          f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
        );

        const spacesWithInitialProposal = getSpacesWithInitialProposalsProcessed(spaceData, editData);

        const spacePluginAddressesWithInitialProposal = new Set(spacesWithInitialProposal.map(s => s.spaceAddress));

        const initialProposalsForSpaces = editData.filter(p =>
          spacePluginAddressesWithInitialProposal.has(p.pluginAddress)
        );

        const proposalsWithInitialSpaceIds = yield* _(getDerivedSpaceIdsFromImportedSpaces(initialProposalsForSpaces));

        const initialSpaceIdsByPluginAddress = proposalsWithInitialSpaceIds.reduce((acc, p) => {
          acc.set(p.pluginAddress, p.spaceId);
          return acc;
        }, new Map<string, string | null>());

        const spacesCreated = spaceData.map(s => {
          return {
            id: initialSpaceIdsByPluginAddress.get(s.spaceAddress) ?? null,
            daoAddress: s.daoAddress,
            spaceAddress: s.spaceAddress,
          };
        });

        createdSpaceIds = yield* _(handleSpacesCreated(spacesCreated, block));
      } else {
        createdSpaceIds = yield* _(handleSpacesCreated(spaceData, block));
      }
    }

    if (personalPluginsCreated.success) {
      const data = personalPluginsCreated.data.personalPluginsCreated.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );

      yield* _(handlePersonalSpacesCreated(data, block));

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
      const initialEditors: InitialEditorsAdded[] = data.map(p => {
        return {
          pluginAddress: p.personalAdminAddress,
          addresses: [p.initialEditor],
          daoAddress: p.daoAddress,
        };
      });

      yield* _(handleInitialPersonalSpaceEditorsAdded(initialEditors, block));
    }

    if (governancePluginsCreatedResponse.success) {
      yield* _(handleGovernancePluginCreated(governancePluginsCreatedResponse.data.governancePluginsCreated, block));
    }

    /**
     * Public plugins get their own event when adding initial edits whereas the personal spaces
     * emit the initial editors as part of the space creation event.
     */
    if (initialEditorsAddedResponse.success) {
      const data = initialEditorsAddedResponse.data.initialEditorsAdded.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );

      yield* _(handleInitialGovernanceSpaceEditorsAdded(data, block));
    }

    if (membersAdded.success) {
      const data = membersAdded.data.membersAdded.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );

      yield* _(handleMemberAdded(data, block));
    }

    if (membersRemoved.success) {
      const data = membersRemoved.data.membersRemoved.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleMemberRemoved(data));
    }

    if (editorsAdded.success) {
      const data = editorsAdded.data.editorsAdded.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleEditorsAdded(data, block));
    }

    if (editorsRemoved.success) {
      const data = editorsRemoved.data.editorsRemoved.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleEditorRemoved(data));
    }

    if (subspacesAdded.success) {
      const data = subspacesAdded.data.subspacesAdded.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleSubspacesAdded(data, block));
    }

    if (subspacesRemoved.success) {
      const data = subspacesRemoved.data.subspacesRemoved.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleSubspacesRemoved(data));
    }

    if (addMembersProposed.success) {
      const data = addMembersProposed.data.proposedAddedMembers.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleMembershipProposalsCreated(data, block));
    }

    if (removeMembersProposed.success) {
      const data = removeMembersProposed.data.proposedRemovedMembers.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleMembershipProposalsCreated(data, block));
    }

    if (addEditorsProposed.success) {
      const data = addEditorsProposed.data.proposedAddedEditors.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleEditorshipProposalsCreated(data, block));
    }

    if (removeEditorsProposed.success) {
      const data = removeEditorsProposed.data.proposedRemovedEditors.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleEditorshipProposalsCreated(data, block));
    }

    if (addSubspacesProposed.success) {
      const data = addSubspacesProposed.data.proposedAddedSubspaces.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleSubspaceProposalsCreated(data, block));
    }

    if (removeSubspacesProposed.success) {
      const data = removeSubspacesProposed.data.proposedRemovedSubspaces.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );
      yield* _(handleSubspaceProposalsCreated(data, block));
    }

    if (editsProposed.success) {
      const data = editsProposed.data.edits.filter(
        f => getChecksumAddress(f.daoAddress) !== getChecksumAddress(US_LAW_SPACE.daoAddress)
      );

      yield* _(handleEditProposalCreated(data, block));
    }

    if (votesCast.success) {
      const data = votesCast.data.votesCast.filter(
        f => getChecksumAddress(f.pluginAddress) !== getChecksumAddress(US_LAW_SPACE.mainVotingPluginAddress)
      );

      yield* _(handleVotesCast(data, block));
    }

    /**
     * If we have a set of "SpacePluginCreated" events in the same block as a set of "ProposalProcessed" events
     * we need to check if any of the processed proposals are because an initial content IPFS URI was passed
     * during space creation.
     *
     * If there are processed proposals as a result of an initial content uri, we need to create the appropriate
     * proposals, proposed versions, ops, etc. before we actually set the proposal as "ACCEPTED"
     */
    if (editsPublishedResponse.success) {
      const data = editsPublishedResponse.data.editsPublished.filter(
        f => f.pluginAddress !== US_LAW_SPACE.mainVotingPluginAddress
      );

      /**
       * Since there are potentially two handlers that we need to run, we abstract out the common
       * data fetching needed for both here, and pass the result to the two handlers. This breaks
       * from the normalized pattern where we have a single handler for every event. For this event
       * there might be two handlers.
       *
       * `getEditsProposalFromProposalIpfsUri` might be an Edit or it might be an Import which
       * contains many edits
       */
      const proposals = yield* _(getEditsProposalsFromIpfsUri(data, block));

      // We need to know if we're reading from a personal space or public space for each proposal.
      //
      // An alternative approach is that we don't require proposal relations for versions. That would
      // require some rewriting of the proposal process flow.
      const personalSpacesWithEdits = yield* _(
        Effect.all(
          proposals.flatMap(p => {
            return Effect.promise(async () => {
              const space = await Spaces.getById(p.space);

              if (space.type === 'personal') {
                return space.id;
              }

              return null;
            });
          }),
          {
            concurrency: 15,
          }
        )
      );

      /**
       * Since we process created spaces and personal spaces separately, don't include any personal
       * spaces in the list that were also created in the same block.
       */
      const personalSpaceIds = personalSpacesWithEdits
        .filter(s => s !== null)
        .filter(s => !createdSpaceIds?.includes(s));

      /**
       * We track the spaces that were created in this block and check if any of the proposals executed
       * are from a created space. If they are we need to create proposals for them before we can actually
       * execute the proposal.
       *
       * We process newly created spaces differently than existing spaces, mostly due to the possibility
       * of a created space containing an import.
       */
      for (const spaceId of createdSpaceIds ?? []) {
        const initialProposalsToWrite = getProposalsForSpaceIds([spaceId], proposals);
        if (initialProposalsToWrite.length > 0) {
          yield* _(
            createInitialContentForSpaces({
              proposals: initialProposalsToWrite,
              block,
              editType: 'IMPORT',
            })
          );
        }
      }

      /**
       * We run import spaces one-at-a-time but run default edits in spaces all at once. This is
       * because imported spaces expect to read data from other edits in the import, while default
       * edits are decoupled from any other edits, so it's safe to run them all at once.
       */
      if (personalSpaceIds.length > 0) {
        const initialProposalsToWrite = getProposalsForSpaceIds(personalSpaceIds, proposals);

        if (initialProposalsToWrite.length > 0) {
          yield* _(
            createInitialContentForSpaces({
              proposals: initialProposalsToWrite,
              block,
              editType: 'DEFAULT',
            })
          );
        }
      }

      if (proposals.length > 0) {
        yield* _(handleEditsPublished(proposals, block));
      }
    }

    if (executedProposals.success) {
      const data = executedProposals.data.executedProposals.filter(
        f => f.pluginAddress !== US_LAW_SPACE.mainVotingPluginAddress
      );

      yield* _(handleProposalsExecuted(data, block));
    }

    return hasValidEvent;
  });
}
