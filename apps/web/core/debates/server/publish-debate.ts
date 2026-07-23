import { daoSpace, getSmartAccountWalletClient, personalSpace } from '@geoprotocol/geo-sdk';
import type { Op } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import { getSpaceAccess } from '~/core/access/space-access';
import { getEntity, getSpace } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { Publish } from '~/core/utils/publish';

import { buildDebatePublishDraft } from '../debate-publish-draft';
import { getDebateAcceptorConfig } from './acceptor-config';
import { loadDebatePublishSource } from './debate-source';

export type PublishDebateResult =
  | { status: 'published'; debateEntityId: string; spaceId: string; userOpHash: string }
  | { status: 'already_published'; debateEntityId: string; spaceId: string }
  | { status: 'not_editor'; debateEntityId: string; spaceId: string }
  | { status: 'acceptor_not_configured' };

/**
 * Publish a finished debate to the knowledge graph as the debate acceptor.
 *
 * Idempotent: the Debate entity id is derived deterministically from the debate id, so if it
 * already exists in the target space we skip re-publishing. Signs with the acceptor's private key
 * (never the participant's wallet), mirroring the browser publish flow in `use-publish.ts`.
 */
export async function publishDebateAsAcceptor(debateId: string): Promise<PublishDebateResult> {
  const config = getDebateAcceptorConfig();
  if (!config) return { status: 'acceptor_not_configured' };

  const { input } = await loadDebatePublishSource(debateId);
  const draft = buildDebatePublishDraft(input);

  const existing = await Effect.runPromise(getEntity(draft.debateEntityId, input.spaceId)).catch(() => null);
  if (existing) {
    return { status: 'already_published', debateEntityId: draft.debateEntityId, spaceId: input.spaceId };
  }

  const space = await Effect.runPromise(getSpace(input.spaceId));
  if (!space) {
    throw new Error(`Space ${input.spaceId} could not be loaded for debate publishing.`);
  }

  // Only auto-publish into spaces the acceptor actually edits. Publishing needs editor rights (a
  // member can propose but not vote+execute), and attempting it elsewhere just reverts on-chain
  // (CanNotExecute). Checked before the IPFS upload so an ineligible space costs nothing.
  const access = await Effect.runPromise(getSpaceAccess(space, config.spaceId));
  if (!access.isEditor) {
    console.log('[debate-acceptor] skipping publish: acceptor is not an editor of the space', {
      debateId,
      spaceId: input.spaceId,
      acceptorSpaceId: config.spaceId,
    });
    return { status: 'not_editor', debateEntityId: draft.debateEntityId, spaceId: input.spaceId };
  }

  const ops = await Effect.runPromise(
    Publish.prepareLocalDataForPublishing(draft.values, draft.relations, input.spaceId)
  );
  if (ops.length === 0) {
    throw new Error(`Debate ${debateId} resolved to an empty edit.`);
  }

  const smartAccount = await getSmartAccountWalletClient({ privateKey: config.privateKey, rpcUrl: config.rpcUrl });

  const userOpHash = await submitEdit({
    name: draft.debateName,
    author: config.spaceId,
    ops,
    space: { id: space.id, type: space.type, address: space.address },
    smartAccount,
  });

  console.log('[debate-acceptor] published debate', {
    debateId,
    debateEntityId: draft.debateEntityId,
    spaceId: input.spaceId,
    userOpHash,
  });

  return { status: 'published', debateEntityId: draft.debateEntityId, spaceId: input.spaceId, userOpHash };
}

type SmartAccount = Awaited<ReturnType<typeof getSmartAccountWalletClient>>;

async function submitEdit({
  name,
  author,
  ops,
  space,
  smartAccount,
}: {
  name: string;
  author: string;
  ops: Op[];
  space: { id: string; type: string; address: string };
  smartAccount: SmartAccount;
}): Promise<string> {
  if (space.type === 'PERSONAL') {
    const { to, calldata } = await personalSpace.publishEdit({
      name,
      spaceId: space.id,
      ops,
      author,
      network: 'TESTNET',
    });
    return sendUserOp(smartAccount, to, calldata);
  }

  // DAO space: the acceptor is an editor, so use FAST voting and auto vote + execute — otherwise the
  // proposal sits pending until someone acts on it from the Governance tab.
  const proposal = await daoSpace.proposeEdit({
    name,
    ops,
    author,
    daoSpaceAddress: space.address as `0x${string}`,
    callerSpaceId: `0x${author}`,
    daoSpaceId: `0x${space.id}`,
    votingMode: 'FAST',
    network: 'TESTNET',
  });

  const createHash = await sendUserOp(smartAccount, proposal.to as `0x${string}`, proposal.calldata as `0x${string}`);
  await confirmUserOp(smartAccount, createHash, 'proposal creation');

  const vote = geo.daoSpaces.proposals.vote({
    authorSpaceId: author,
    spaceId: space.id,
    proposalId: proposal.proposalId,
    vote: 'YES',
  });
  const voteHash = await sendUserOp(smartAccount, vote.to as `0x${string}`, vote.calldata as `0x${string}`);
  await confirmUserOp(smartAccount, voteHash, 'vote');

  const execute = geo.daoSpaces.proposals.execute({
    authorSpaceId: author,
    spaceId: space.id,
    proposalId: proposal.proposalId,
  });
  const executeHash = await sendUserOp(smartAccount, execute.to as `0x${string}`, execute.calldata as `0x${string}`);
  await confirmUserOp(smartAccount, executeHash, 'execute');

  return createHash;
}

async function sendUserOp(smartAccount: SmartAccount, to: `0x${string}`, data: `0x${string}`): Promise<`0x${string}`> {
  return smartAccount.sendUserOperation({ calls: [{ to, value: 0n, data }] });
}

async function confirmUserOp(smartAccount: SmartAccount, hash: `0x${string}`, label: string): Promise<void> {
  const receipt = await smartAccount.waitForUserOperationReceipt({ hash });
  if (!receipt.success) {
    throw new Error(`Debate publish ${label} transaction reverted (${hash}).`);
  }
}
