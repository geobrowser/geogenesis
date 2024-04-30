import { Data, Effect, Either } from 'effect';

import { getProposalFromCreatedProposalIpfsUri } from './get-proposal-from-created-proposal';
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
import { retryEffect } from '~/sink/utils/retry-effect';
import { slog } from '~/sink/utils/slog';

class CouldNotWriteCreatedProposalsError extends Error {
  _tag: 'CouldNotWriteCreatedProposalsError' = 'CouldNotWriteCreatedProposalsError';
}

export function handleProposalsCreated(proposalsCreated: ProposalCreated[], block: BlockEvent) {
  return Effect.gen(function* (_) {
    const telemetry = yield* _(Telemetry);

    slog({
      requestId: block.requestId,
      message: `Processing ${proposalsCreated.length} proposals`,
    });

    slog({
      requestId: block.requestId,
      message: `Gathering IPFS content for ${proposalsCreated.length} proposals`,
    });

    const maybeProposals = yield* _(
      Effect.all(
        proposalsCreated.map(proposal => getProposalFromCreatedProposalIpfsUri(proposal, block)),
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
      requestId: block.requestId,
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
      telemetry.captureException(error);

      slog({
        level: 'error',
        requestId: block.requestId,
        message: `Could not write accounts when creating new proposals
          Cause: ${error.cause}
          Message: ${error.message}
        `,
      });

      return;
    }

    // @TODO: Put this in a transaction since all these writes are related
    const writtenProposals = yield* _(
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
          return new CouldNotWriteCreatedProposalsError(String(error));
        },
      }),
      retryEffect,
      Effect.either
    );

    if (Either.isLeft(writtenProposals)) {
      const error = writtenProposals.left;
      telemetry.captureException(error);

      slog({
        requestId: block.requestId,
        message: 'Could not write created proposals',
        level: 'error',
      });

      return;
    }

    slog({
      requestId: block.requestId,
      message: 'Created proposals written successfully!',
    });
  });
}
