import { createGrpcTransport } from '@connectrpc/connect-node';
import { authIssue, createAuthInterceptor, createRegistry } from '@substreams/core';
import { readPackageFromFile } from '@substreams/manifest';
import { createSink, createStream } from '@substreams/sink';
import { Effect, Stream } from 'effect';
import * as db from 'zapatos/db';
import type * as S from 'zapatos/schema';

import { MANIFEST } from './constants/constants';
import { readCursor, writeCursor } from './cursor';
import {
  Accounts,
  Actions,
  Proposals,
  ProposedEditors,
  ProposedMembers,
  ProposedSubspaces,
  ProposedVersions,
  SpaceMembers,
} from './db';
import { populateApprovedContentProposal } from './entries/populate-approved-content-proposal';
import { handleEditorsAdded } from './events/editors-added/handler';
import { ZodEditorsAddedStreamResponse } from './events/editors-added/parser';
import { handleOnchainProfilesRegistered } from './events/onchain-profile-registered/handler';
import { ZodOnchainProfilesRegisteredStreamResponse } from './events/onchain-profile-registered/parser';
import { handleGovernancePluginCreated, handleSpacesCreated } from './events/spaces-created/handler';
import {
  ZodGovernancePluginsCreatedStreamResponse,
  ZodSpacePluginCreatedStreamResponse,
} from './events/spaces-created/parser';
import { handleSubspacesAdded } from './events/subspaces-added/handler';
import { ZodSubspacesAddedStreamResponse } from './events/subspaces-added/parser';
import { handleSubspacesRemoved } from './events/subspaces-removed/handler';
import { ZodSubspacesRemovedStreamResponse } from './events/subspaces-removed/parser';
import { mapMembers } from './members/map-members';
import { ZodMembersApprovedStreamResponse } from './parsers/members-approved';
import { ZodProposalExecutedStreamResponse } from './parsers/proposal-executed';
import {
  type ContentProposal,
  type EditorshipProposal,
  type MembershipProposal,
  type SubspaceProposal,
  ZodProposalProcessedStreamResponse,
  ZodProposalStreamResponse,
} from './parsers/proposals';
import { ZodVotesCastStreamResponse } from './parsers/votes';
import {
  groupProposalsByType,
  mapContentProposalsToSchema,
  mapEditorshipProposalsToSchema,
  mapMembershipProposalsToSchema,
  mapSubspaceProposalsToSchema,
} from './proposals/map-proposals';
import { slog } from './utils';
import { getSpaceForVotingPlugin } from './utils/get-space-for-voting-plugin';
import { invariant } from './utils/invariant';
import { getProposalFromMetadata, getProposalFromProcessedProposal } from './utils/ipfs';
import { pool } from './utils/pool';
import { mapVotes } from './votes/map-votes';

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

          yield* _(
            Effect.tryPromise({
              try: () => writeCursor(cursor, blockNumber),
              catch: () => new CouldNotWriteCursorError(),
            })
          );

          if (blockNumber % 1000 === 0) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);
          }

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

          const spacePluginCreatedResponse = ZodSpacePluginCreatedStreamResponse.safeParse(jsonOutput);
          const governancePluginsCreatedResponse = ZodGovernancePluginsCreatedStreamResponse.safeParse(jsonOutput);
          const subspacesAdded = ZodSubspacesAddedStreamResponse.safeParse(jsonOutput);
          const subspacesRemoved = ZodSubspacesRemovedStreamResponse.safeParse(jsonOutput);
          const editorsAddedResponse = ZodEditorsAddedStreamResponse.safeParse(jsonOutput);
          const proposalResponse = ZodProposalStreamResponse.safeParse(jsonOutput);
          const proposalProcessedResponse = ZodProposalProcessedStreamResponse.safeParse(jsonOutput);
          const votesCast = ZodVotesCastStreamResponse.safeParse(jsonOutput);
          const profilesRegistered = ZodOnchainProfilesRegisteredStreamResponse.safeParse(jsonOutput);
          const executedProposals = ZodProposalExecutedStreamResponse.safeParse(jsonOutput);
          const membersApproved = ZodMembersApprovedStreamResponse.safeParse(jsonOutput);

          if (profilesRegistered.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            yield* _(
              handleOnchainProfilesRegistered(profilesRegistered.data.profilesRegistered, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          if (spacePluginCreatedResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            yield* _(
              handleSpacesCreated(spacePluginCreatedResponse.data.spacesCreated, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          if (governancePluginsCreatedResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            yield* _(
              handleGovernancePluginCreated(governancePluginsCreatedResponse.data.governancePluginsCreated, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          if (subspacesAdded.success) {
            console.log('----------------- @BLOCK', blockNumber, '-----------------');

            yield* _(
              handleSubspacesAdded(subspacesAdded.data.subspacesAdded, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          if (subspacesRemoved.success) {
            console.log('----------------- @BLOCK', blockNumber, '-----------------');

            yield* _(
              handleSubspacesRemoved(subspacesRemoved.data.subspacesRemoved, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          if (editorsAddedResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            yield* _(
              handleEditorsAdded(editorsAddedResponse.data.editorsAdded, {
                blockNumber,
                cursor,
                timestamp,
              })
            );
          }

          /**
           * Proposals represent a proposal to change the state of a DAO-based space. Proposals can
           * represent changes to content, membership (editor or member), governance changes, subspace
           * membership, or anything else that can be executed by a DAO.
           *
           * Currently we use a simple majority voting model, where a proposal requires 51% of the
           * available votes in order to pass. Only editors are allowed to vote on proposals, but editors
           * _and_ members can create them.
           */
          if (proposalResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            slog({
              requestId: message.cursor,
              message: `Processing ${proposalResponse.data.proposalsCreated.length} proposals`,
            });

            slog({
              requestId: message.cursor,
              message: `Gathering IPFS content for ${proposalResponse.data.proposalsCreated.length} proposals`,
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
              (
                maybeProposal
              ): maybeProposal is ContentProposal | SubspaceProposal | MembershipProposal | EditorshipProposal =>
                maybeProposal !== null
            );

            const { contentProposals, subspaceProposals, memberProposals, editorProposals } =
              groupProposalsByType(proposals);
            const schemaContentProposals = mapContentProposalsToSchema(contentProposals, blockNumber, cursor);
            const schemaSubspaceProposals = mapSubspaceProposalsToSchema(subspaceProposals, blockNumber);
            const schemaMembershipProposals = mapMembershipProposalsToSchema(memberProposals, blockNumber);
            const schemaEditorshipProposals = mapEditorshipProposalsToSchema(editorProposals, blockNumber);

            slog({
              requestId: message.cursor,
              message: `Writing ${contentProposals.length} content proposals to DB`,
            });

            slog({
              requestId: message.cursor,
              message: `Writing ${subspaceProposals.length} subspace proposals to DB`,
            });

            slog({
              requestId: message.cursor,
              message: `Writing ${memberProposals.length} membership proposals to DB`,
            });

            slog({
              requestId: message.cursor,
              message: `Writing ${editorProposals.length} editorship proposals to DB`,
            });

            // This might be the very first onchain interaction for a wallet address,
            // so we need to make sure that any accounts are already created when we
            // process the proposals below, particularly for editor and member requests.
            yield* _(
              Effect.tryPromise({
                try: async () => Accounts.upsert(schemaEditorshipProposals.accounts),
                catch: error => {
                  slog({
                    requestId: message.cursor,
                    message: `Failed to write accounts to DB when processing new proposals ${error}`,
                    level: 'error',
                  });

                  return error;
                },
              })
            );

            // @TODO: Put this in a transaction since all these writes are related
            yield* _(
              Effect.tryPromise({
                try: async () => {
                  // @TODO: Batch since there might be postgres byte limits. See upsertChunked
                  await Promise.all([
                    // Content proposals
                    Proposals.upsert(schemaContentProposals.proposals),
                    ProposedVersions.upsert(schemaContentProposals.proposedVersions),
                    Actions.upsert(schemaContentProposals.actions),

                    // Subspace proposals
                    Proposals.upsert(schemaSubspaceProposals.proposals),
                    ProposedSubspaces.upsert(schemaSubspaceProposals.proposedSubspaces),

                    // Editorship proposals
                    Proposals.upsert(schemaEditorshipProposals.proposals),
                    ProposedEditors.upsert(schemaEditorshipProposals.proposedEditors),

                    // Membership proposals
                    Proposals.upsert(schemaMembershipProposals.proposals),
                    ProposedMembers.upsert(schemaMembershipProposals.proposedMembers),
                  ]);
                },
                catch: error => {
                  slog({
                    requestId: message.cursor,
                    message: `Failed to write proposals to DB ${error}`,
                    level: 'error',
                  });

                  return error;
                },
              })
            );
          }

          // A proposal might be processed as part of the initial space creation. If this happens we
          // need to write any DB dependencies that normally exist when processing a proposal, like
          // proposed versions, the proposal, actions, etc.
          //
          // @TODO: This actually doesn't handle the case where there are processed proposals
          // _and_ spaces created in the same block that aren't related. We need to be able to check
          // that a proposal being processed is for a given space here or not
          if (spacePluginCreatedResponse.success && proposalProcessedResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);
            const onchainProposals = proposalProcessedResponse.data.proposalsProcessed;

            /**
             * Write the proposal data for a "proposed" proposal
             */
            slog({
              requestId: message.cursor,
              message: `Processing ${onchainProposals.length} initial space proposals`,
            });

            slog({
              requestId: message.cursor,
              message: `Gathering IPFS content for ${onchainProposals.length} initial space proposals`,
            });

            const maybeProposalsFromIpfs = yield* _(
              Effect.all(
                proposalProcessedResponse.data.proposalsProcessed.map(proposal =>
                  getProposalFromProcessedProposal(
                    {
                      ipfsUri: proposal.contentUri,
                      pluginAddress: proposal.pluginAddress,
                    },
                    timestamp
                  )
                ),
                {
                  concurrency: 20,
                }
              )
            );

            const proposalsFromIpfs = maybeProposalsFromIpfs.filter(
              (maybeProposal): maybeProposal is ContentProposal => maybeProposal !== null
            );

            const { contentProposals } = groupProposalsByType(proposalsFromIpfs);
            const schemaContentProposals = mapContentProposalsToSchema(contentProposals, blockNumber, cursor);

            slog({
              requestId: message.cursor,
              message: `Writing ${contentProposals.length} initial content proposals to DB`,
            });

            // @TODO: Put this in a transaction since all these writes are related
            yield* _(
              Effect.either(
                Effect.tryPromise({
                  try: async () => {
                    // @TODO: Batch since there might be postgres byte limits. See upsertChunked
                    await Promise.all([
                      // @TODO: Should we only attempt to write to the db for the correct content type?
                      // What if we get multiple proposals in the same block with different content types?
                      // Content proposals
                      Proposals.upsert(schemaContentProposals.proposals),
                      ProposedVersions.upsert(schemaContentProposals.proposedVersions),
                      Actions.upsert(schemaContentProposals.actions),
                    ]);
                  },
                  catch: error => {
                    slog({
                      requestId: message.cursor,
                      message: `Failed to write proposals to DB ${error}`,
                      level: 'error',
                    });

                    return error;
                  },
                })
              )
            );

            /**
             * Write the proposal data for an "accepted" proposal
             */
            const maybeProposals = yield* _(
              Effect.all(
                proposalsFromIpfs.map(p => {
                  return Effect.tryPromise({
                    try: () => db.selectExactlyOne('proposals', { id: p.proposalId }).run(pool),
                    catch: error => {
                      slog({
                        requestId: message.cursor,
                        message: `Failed to read proposal from DB ${error}`,
                        level: 'error',
                      });
                    },
                  });
                })
              )
            );

            const proposals = maybeProposals.filter(
              (maybeProposal): maybeProposal is S.proposals.Selectable => maybeProposal !== null
            );

            yield* _(
              Effect.all(
                proposals.map(proposal => {
                  return Effect.tryPromise({
                    try: () => db.update('proposals', { status: 'accepted' }, { id: proposal.id }).run(pool),
                    catch: () => {
                      slog({
                        requestId: message.cursor,
                        message: `Failed to update proposal in DB ${proposal.id}`,
                        level: 'error',
                      });
                    },
                  });
                })
              )
            );

            slog({
              requestId: message.cursor,
              message: `Processing ${proposalProcessedResponse.data.proposalsProcessed.length} processed proposals for initial space proposals`,
            });

            yield* _(
              populateApprovedContentProposal(
                proposals,
                proposalsFromIpfs.flatMap(p => p.actions),
                timestamp,
                blockNumber
              )
            );

            slog({
              requestId: message.cursor,
              message: `Wrote ${proposals.length} processed proposals to DB for initial space proposals`,
            });
          } else if (proposalProcessedResponse.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);
            /**
             * 1. Fetch IPFS content
             * 2. Find the proposal based on the proposalId
             * 3. Update the proposal status to ACCEPTED
             * 4. Write the proposal content as Versions, Triples, Entities, etc.
             */
            const maybeProposalsFromIpfs = yield* _(
              Effect.all(
                proposalProcessedResponse.data.proposalsProcessed.map(proposal =>
                  getProposalFromProcessedProposal(
                    {
                      ipfsUri: proposal.contentUri,
                      pluginAddress: proposal.pluginAddress,
                    },
                    timestamp
                  )
                ),
                {
                  concurrency: 20,
                }
              )
            );

            const proposalsFromIpfs = maybeProposalsFromIpfs.filter(
              (maybeProposal): maybeProposal is ContentProposal => maybeProposal !== null
            );

            const maybeProposals = yield* _(
              Effect.all(
                proposalsFromIpfs.map(p => {
                  return Effect.tryPromise({
                    try: () => db.selectExactlyOne('proposals', { id: p.proposalId }).run(pool),
                    catch: error => {
                      slog({
                        requestId: message.cursor,
                        message: `Failed to read proposal from DB ${error}`,
                        level: 'error',
                      });
                    },
                  });
                })
              )
            );

            const proposals = maybeProposals.filter(
              (maybeProposal): maybeProposal is S.proposals.Selectable => maybeProposal !== null
            );

            yield* _(
              Effect.all(
                proposals.map(proposal => {
                  return Effect.tryPromise({
                    try: () => db.update('proposals', { status: 'accepted' }, { id: proposal.id }).run(pool),
                    catch: () => {
                      slog({
                        requestId: message.cursor,
                        message: `Failed to update proposal in DB ${proposal.id}`,
                        level: 'error',
                      });
                    },
                  });
                })
              )
            );

            yield* _(
              populateApprovedContentProposal(
                proposals,
                proposalsFromIpfs.flatMap(p => p.actions),
                timestamp,
                blockNumber
              )
            );

            slog({
              requestId: message.cursor,
              message: `Processing ${proposalProcessedResponse.data.proposalsProcessed.length} processed proposals`,
            });

            slog({
              requestId: message.cursor,
              message: `Writing ${proposals.length} processed proposals to DB`,
            });
          }

          if (membersApproved.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);
            console.info('MEMBERS APPROVED', JSON.stringify(membersApproved.data.membersApproved, null, 2));

            const schemaMembers = yield* _(
              mapMembers({ membersApproved: membersApproved.data.membersApproved, blockNumber, timestamp })
            );

            slog({
              requestId: message.cursor,
              message: `Writing ${schemaMembers.length} approved members to DB`,
            });

            yield* _(
              Effect.tryPromise({
                try: () => SpaceMembers.upsert(schemaMembers),
                catch: error => {
                  slog({
                    level: 'error',
                    requestId: message.cursor,
                    message: `Failed to write approved members to DB ${error}`,
                  });
                  return error;
                },
              })
            );

            slog({
              requestId: message.cursor,
              message: `Members written successfully`,
            });
          }

          if (executedProposals.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);
            const proposals = executedProposals.data.executedProposals;

            slog({
              requestId: message.cursor,
              message: `Updating ${proposals.length} proposals after execution`,
            });

            yield* _(
              Effect.all(
                proposals.map(proposal => {
                  return Effect.tryPromise({
                    try: async () => {
                      // @TODO: There might be executed proposals coming from both the member access plugin
                      // and the voting plugin, so we need to handle both cases.
                      //
                      // Alternatively we use the `Approved` event to update events coming from the member
                      // access plugin. I'm not sure if overloading the ProposalExecuted event for multiple
                      // proposal types is better than using unique events for each proposal type.
                      const spaceEffect = getSpaceForVotingPlugin(proposal.pluginAddress as `0x${string}`);
                      const space = await Effect.runPromise(spaceEffect);

                      if (space) {
                        return await db
                          .update(
                            'proposals',
                            { status: 'accepted' },
                            // @TODO: There might be multiple proposals with the same onchain_proposal_id
                            // if there are proposals from both the voting plugin and the member access plugin.
                            { onchain_proposal_id: proposal.proposalId, space_id: space, type: 'CONTENT' }
                          )
                          .run(pool);
                      }
                    },
                    catch: error => {
                      slog({
                        requestId: message.cursor,
                        message: `Failed to update executed proposal ${proposal.proposalId} from voting plugin ${
                          proposal.pluginAddress
                        } ${String(error)}`,
                        level: 'error',
                      });
                    },
                  });
                })
              )
            );

            slog({
              requestId: message.cursor,
              message: `${proposals.length} proposals updated successfully!`,
            });
          }

          if (votesCast.success) {
            console.info(`----------------- @BLOCK ${blockNumber} -----------------`);

            slog({
              requestId: message.cursor,
              message: `Writing ${votesCast.data.votesCast.length} votes to DB in block`,
            });

            const schemaVotes = yield* _(mapVotes(votesCast.data.votesCast, blockNumber, timestamp));

            yield* _(
              Effect.tryPromise({
                try: () => db.insert('proposal_votes', schemaVotes).run(pool),
                catch: error => {
                  slog({
                    requestId: message.cursor,
                    message: `Failed to write votes to DB ${error}`,
                    level: 'error',
                  });
                },
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
