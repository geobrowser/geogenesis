import { Effect, Either } from 'effect';
import fs from 'fs';
import { Type, loadSync } from 'protobufjs';

import { mapIpfsProposalToSchemaProposalByType } from '../../proposals-created/map-proposals';
import { type Edit, type EditProposal, ZodEdit } from '../../proposals-created/parser';
import {
  Accounts,
  Ops,
  Proposals,
  ProposedEditors,
  ProposedMembers,
  ProposedSubspaces,
  ProposedVersions,
} from '~/sink/db';
import { CouldNotWriteAccountsError } from '~/sink/errors';
import { Telemetry, TelemetryLive } from '~/sink/telemetry';
import { retryEffect } from '~/sink/utils/retry-effect';

class CouldNotWriteCreatedProposalsError extends Error {
  _tag: 'CouldNotWriteCreatedProposalsError' = 'CouldNotWriteCreatedProposalsError';
}

const decode = Effect.gen(function* (_) {
  const root = loadSync('schema.proto');
  const Edit = root.lookupType('Edit');

  let fileContents = fs.readFileSync(`data.pb`);
  const deserializedData = yield* _(deserialize(fileContents, Edit));
  const data = ZodEdit.safeParse(deserializedData);

  console.log('serialized', JSON.stringify(deserializedData, null, 2));

  console.log('success', data.success);

  if (data.success) {
    const result: EditProposal = {
      ...data.data,
      creator: data.data.authors[0] as string,
      type: 'EDIT',
      space: '',
      proposalId: '1',
      onchainProposalId: '0',
      metadataUri: '',
      pluginAddress: '0x',
      startTime: '0',
      endTime: '0',
    };

    return result;
  }

  return null;
});

function deserialize(data: Buffer, messageType: Type) {
  return Effect.gen(function* _() {
    const deserializedData = messageType.decode(data);
    return messageType.toObject(deserializedData, {
      longs: String,
      enums: String,
      bytes: String,
    });
  });
}

function handleProposalCreated(edit: EditProposal | null) {
  return Effect.gen(function* (_) {
    if (!edit) {
      return;
    }

    const telemetry = yield* _(Telemetry);

    const { schemaEditProposals, schemaSubspaceProposals, schemaMembershipProposals, schemaEditorshipProposals } =
      mapIpfsProposalToSchemaProposalByType([edit], {
        blockNumber: 0,
        cursor: '',
        requestId: '',
        timestamp: 0,
      });

    // This might be the very first onchain interaction for a wallet address,
    // so we need to make sure that any accounts are already created when we
    // process the proposals below, particularly for editor and member requests.
    const writtenAccounts = yield* _(
      Effect.tryPromise({
        try: async () => {
          const accounts = [...schemaMembershipProposals.accounts, ...schemaEditorshipProposals.accounts];
          return await Accounts.upsert(accounts);
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

      return;
    }

    // @TODO: Put this in a transaction since all these writes are related
    const writtenProposals = yield* _(
      Effect.tryPromise({
        try: async () => {
          // @TODO: Batch since there might be postgres byte limits. See upsertChunked
          await Promise.all([
            // Content proposals
            Proposals.upsert(schemaEditProposals.proposals),
            ProposedVersions.upsert(schemaEditProposals.proposedVersions),
            Ops.upsert(schemaEditProposals.ops),

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

      return;
    }

    // const proposals = mapIpfsProposalToSchemaProposalByType([edit], {
    //   blockNumber: 0,
    //   cursor: '',
    //   timestamp: 0,
    //   requestId: '',
    // });
  });
}

const decoded = Effect.runSync(decode);
console.log('decoded', decoded);
console.log(
  await Effect.runPromise(handleProposalCreated(decoded).pipe(Effect.provideService(Telemetry, TelemetryLive)))
);
