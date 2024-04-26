import { Effect, Either } from 'effect';

import {
  Accounts,
  Actions,
  Proposals,
  ProposedEditors,
  ProposedMembers,
  ProposedSubspaces,
  ProposedVersions,
} from '~/sink/db';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import {
  groupProposalsByType,
  mapContentProposalsToSchema,
  mapEditorshipProposalsToSchema,
  mapMembershipProposalsToSchema,
  mapSubspaceProposalsToSchema,
} from '~/sink/events/proposals-created/map-proposals';
import type {
  ContentProposal,
  EditorshipProposal,
  MembershipProposal,
  ProposalCreated,
  SubspaceProposal,
} from '~/sink/events/proposals-created/parser';
import { Telemetry } from '~/sink/telemetry';
import type { BlockEvent } from '~/sink/types';
import { getProposalFromMetadata } from '~/sink/utils/ipfs';
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

export function handleProposalsCreated(proposalsCreated: ProposalCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    slog({
      requestId: block.cursor,
      message: `Processing ${proposalsCreated.length} proposals`,
    });

    slog({
      requestId: block.cursor,
      message: `Gathering IPFS content for ${proposalsCreated.length} proposals`,
    });

    const maybeProposals = yield* _(
      Effect.all(
        proposalsCreated.map(proposal => getProposalFromMetadata(proposal)),
        {
          concurrency: 20,
        }
      )
    );

    const proposals = maybeProposals.filter(
      (maybeProposal): maybeProposal is ContentProposal | SubspaceProposal | MembershipProposal | EditorshipProposal =>
        maybeProposal !== null
    );

    const { contentProposals, subspaceProposals, memberProposals, editorProposals } = groupProposalsByType(proposals);
    const schemaContentProposals = mapContentProposalsToSchema(contentProposals, block);
    const schemaSubspaceProposals = mapSubspaceProposalsToSchema(subspaceProposals, block);
    const schemaMembershipProposals = mapMembershipProposalsToSchema(memberProposals, block);
    const schemaEditorshipProposals = mapEditorshipProposalsToSchema(editorProposals, block);

    slog({
      requestId: block.cursor,
      message: `Writing proposals
        Content proposals: ${contentProposals.length}
        Subspace proposals: ${subspaceProposals.length}
        Editor proposals: ${editorProposals.length}
      `,
    });

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    const writtenAccounts = yield* _(
      Effect.tryPromise({
        try: async () => {
          return await Accounts.upsert(schemaEditorshipProposals.accounts);
        },
        catch: error => {
          return new CouldNotWriteAccountsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenAccounts)) {
      const error = writtenAccounts.left;
      Telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.cursor,
        message: `Could not write accounts when processing new proposals
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

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
          // @TODO: Once we have transactions do real error handling for the entire transaction
          slog({
            requestId: block.cursor,
            message: `Failed to write proposals to DB ${error}`,
            level: 'error',
          });

          return error;
        },
      })
    );
  });
}
