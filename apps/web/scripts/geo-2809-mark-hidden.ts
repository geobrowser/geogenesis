/**
 * GEO-2809: mint the `Hidden` property and set it on the 12 debates geo-chat has hidden.
 *
 * Pairs with the guard in `app/space/(entity)/[id]/[entityId]/page.tsx`, which 404s any entity
 * carrying this marker. Until this runs, that guard has nothing to act on; until the guard
 * deploys, this marker has no effect. Either order is safe.
 *
 * The property entity is minted once, into the AI space — a property id is global, so it only
 * needs to exist somewhere. The boolean value is then written per entity, in that entity's own
 * space, because `entityPageQuery` reads `valuesList` space-scoped.
 *
 *   DRY_RUN=1 bun scripts/geo-2809-mark-hidden.ts     # default
 *   DRY_RUN=0 bun scripts/geo-2809-mark-hidden.ts
 *   DRY_RUN=0 MODE=unhide bun scripts/geo-2809-mark-hidden.ts
 */
import { generateZeroDevAccount } from '@geogenesis/auth/account';
import { defineGeoNetworkConfig } from '@geoprotocol/geo-sdk';
import { entities, properties } from '@geoprotocol/geo-sdk/ops';

import { privateKeyToAccount } from 'viem/accounts';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { HIDDEN_PROPERTY_ID } from '~/core/moderation/hidden';
import { geo } from '~/core/sdk/geo-client';
import { GEO_NETWORK } from '~/core/sdk/geo-network';

/** Where the Hidden property entity itself is minted. Any space works; ids are global. */
const PROPERTY_HOME_SPACE = { name: 'AI', id: '41e851610e13a19441c4d980f2f2ce6b' };

const PLAN: { name: string; id: string; entityIds: string[] }[] = [
  {
    name: 'Crypto',
    id: 'c9f267dcb0d270718c2a3c45a64afd32',
    entityIds: [
      '019f5bb7d0427a61a53f9d5583c74e47',
      '019f5bc7cba07b03a12980aced1eefcc',
      '019fa957ea057553b8d37f8bd98e2df3',
      '019fc7d407177d32a5b5ca60491473f0',
      '019ff163ebbb73d0a1b71c0a8273abfa',
    ],
  },
  {
    name: 'AI',
    id: '41e851610e13a19441c4d980f2f2ce6b',
    entityIds: ['019fc7b016e97401820133e97f631506', '019fc941a8e275c388d9a8249560f1c4', '019fcd7f0ca072e09dc1c72862bfb995'],
  },
  {
    name: 'Health',
    id: '52c7ae149838b6d47ce0f3b2a5974546',
    entityIds: ['019fae4871e877318899a79d88ad529d', '01a0448a61d371018434a20fdadf6f97'],
  },
  {
    name: 'World affairs',
    id: '89bd89bf28ff8a0963faf92a8c905e20',
    entityIds: ['019faedec88d76b3b4d03ab3b98d1ef5', '01a011b077cd78b2b366b9ca7ffc38d4'],
  },
];

const DRY_RUN = process.env.DRY_RUN !== '0';
const MODE = process.env.MODE === 'unhide' ? 'unhide' : 'hide';
const MINT_PROPERTY = process.env.SKIP_MINT !== '1' && MODE === 'hide';
/** Comma-separated space names, to resume after a partial run. Empty means all. */
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  const config = getDebateAcceptorConfig();
  if (!config) throw new Error('acceptor not configured');

  const total = PLAN.reduce((n, s) => n + s.entityIds.length, 0);
  console.log(`GEO-2809 ${MODE}: ${total} entities across ${PLAN.length} spaces${DRY_RUN ? '  [DRY RUN]' : ''}`);
  console.log(`Hidden property: ${HIDDEN_PROPERTY_ID}`);

  const signer = privateKeyToAccount(config.privateKey);
  const network = config.rpcUrl
    ? defineGeoNetworkConfig({ ...GEO_NETWORK, chain: { ...GEO_NETWORK.chain!, rpcUrl: config.rpcUrl } })
    : GEO_NETWORK;
  const smartAccount = DRY_RUN ? null : await generateZeroDevAccount({ signer, network });

  const publish = async (spaceId: string, name: string, ops: unknown[], label: string) => {
    if (DRY_RUN || !smartAccount) {
      console.log(`    [dry run] ${label}: ${ops.length} ops -> ${spaceId}`);
      return;
    }
    const proposal = await geo.daoSpaces.proposeEdit({
      name,
      ops: ops as never,
      author: config.spaceId,
      callerSpaceId: `0x${config.spaceId}`,
      daoSpaceId: `0x${spaceId}`,
      votingMode: 'FAST',
    });
    const createHash = await smartAccount.sendUserOperation({
      calls: [{ to: proposal.to as `0x${string}`, value: 0n, data: proposal.calldata as `0x${string}` }],
    });
    await smartAccount.waitForUserOperationReceipt({ hash: createHash });
    const vote = geo.daoSpaces.voteProposal({
      authorSpaceId: config.spaceId,
      spaceId,
      proposalId: proposal.proposalId,
      vote: 'YES',
    });
    const voteHash = await smartAccount.sendUserOperation({
      calls: [{ to: vote.to as `0x${string}`, value: 0n, data: vote.calldata as `0x${string}` }],
    });
    await smartAccount.waitForUserOperationReceipt({ hash: voteHash });
    console.log(`    ${label}: proposal ${proposal.proposalId} published`);
  };

  if (MINT_PROPERTY) {
    console.log(`\n=== mint Hidden property in ${PROPERTY_HOME_SPACE.name}`);
    const { ops } = properties.create({ id: HIDDEN_PROPERTY_ID, name: 'Hidden', dataType: 'BOOLEAN' });
    await publish(PROPERTY_HOME_SPACE.id, 'Add Hidden property (GEO-2809)', ops, 'mint');
  }

  for (const space of PLAN) {
    if (ONLY.length > 0 && !ONLY.includes(space.name.toLowerCase())) {
      console.log(`\n=== ${space.name} — skipped (ONLY=${ONLY.join(',')})`);
      continue;
    }
    console.log(`\n=== ${space.name} (${space.id}) — ${space.entityIds.length} entities`);
    const ops = space.entityIds.flatMap(entityId => {
      for (const id of [entityId]) console.log(`    ${MODE === 'hide' ? 'set' : 'unset'} Hidden on ${id}`);
      return MODE === 'hide'
        ? entities.update({ id: entityId, values: [{ property: HIDDEN_PROPERTY_ID, type: 'boolean', value: true }] }).ops
        : entities.update({ id: entityId, unset: [{ property: HIDDEN_PROPERTY_ID }] }).ops;
    });
    await publish(space.id, `${MODE === 'hide' ? 'Hide' : 'Unhide'} debates (GEO-2809)`, ops, space.name);
  }

  console.log('\nDone. Guard lives in app/space/(entity)/[id]/[entityId]/page.tsx.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
