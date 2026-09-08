/**
 * GEO-2809 one-off backfill.
 *
 * Drops the `types -> Debate` relation from the 12 debates that geo-chat has hidden
 * (`hidden_at IS NOT NULL`). Hiding only ever reached geo-chat, so these entities still render and
 * play at their own URL. Untyping them is what actually removes them from every graph surface:
 * `page.tsx`'s DEBATE_TYPE_ID branch, and every `entitiesRankedForFeedConnection(typeIds: [...])`
 * caller (feed, explore, counts).
 *
 * Reversible: `MODE=restore` re-adds the same relations by id.
 *
 * Signs as the debate acceptor, exactly like `publish-debate.ts` — same ZeroDev sponsored
 * user-op flow, same FAST proposal + self-vote. geo-cli cannot do this: it only knows chains
 * 19411/80451, and the spaces live on 55516.
 *
 *   DRY_RUN=1 bun scripts/geo-2809-untype.ts     # default, prints the plan
 *   DRY_RUN=0 bun scripts/geo-2809-untype.ts
 *   DRY_RUN=0 MODE=restore bun scripts/geo-2809-untype.ts
 */
import { generateZeroDevAccount } from '@geogenesis/auth/account';
import { defineGeoNetworkConfig } from '@geoprotocol/geo-sdk';
import { relations } from '@geoprotocol/geo-sdk/ops';

import { privateKeyToAccount } from 'viem/accounts';

import { getDebateAcceptorConfig } from '~/core/debates/server/acceptor-config';
import { geo } from '~/core/sdk/geo-client';
import { GEO_NETWORK } from '~/core/sdk/geo-network';

type Target = { relationId: string; entityId: string };
type SpacePlan = { name: string; id: string; address: `0x${string}`; targets: Target[] };

const PLAN: SpacePlan[] = [
  {
    name: 'Crypto',
    id: 'c9f267dcb0d270718c2a3c45a64afd32',
    address: '0xF3E30A621aAef2e924bBf777440999b973111222',
    targets: [
      { relationId: '558b394ce3c84ee3a62ee7fe6a23548a', entityId: '019f5bb7d0427a61a53f9d5583c74e47' },
      { relationId: 'fc3d248cb3474709a782a30376d25ae8', entityId: '019f5bc7cba07b03a12980aced1eefcc' },
      { relationId: '302bc011366a4eb6b9a22f2a8336fde6', entityId: '019fa957ea057553b8d37f8bd98e2df3' },
      { relationId: '4748209d6cc44532a455a7ea2ce9812e', entityId: '019fc7d407177d32a5b5ca60491473f0' },
      { relationId: '2c646f0d4a6a4a4ab0bc77edcbb14ef7', entityId: '019ff163ebbb73d0a1b71c0a8273abfa' },
    ],
  },
  {
    name: 'AI',
    id: '41e851610e13a19441c4d980f2f2ce6b',
    address: '0x97F0F4B00bD93dA147F223fe5b461ed803e69D97',
    targets: [
      { relationId: 'db41cc62a294492d8078d18737bd1dfb', entityId: '019fc7b016e97401820133e97f631506' },
      { relationId: 'bcc45b65c12c4017bbb6880ac6f8c8ae', entityId: '019fc941a8e275c388d9a8249560f1c4' },
      { relationId: '955c57195cd044e395f90865c67ec978', entityId: '019fcd7f0ca072e09dc1c72862bfb995' },
    ],
  },
  {
    name: 'Health',
    id: '52c7ae149838b6d47ce0f3b2a5974546',
    address: '0x186C781F24d9f2460667EDC453E0587ef8600979',
    targets: [
      { relationId: 'eb23b5d6cf564182893208ffa6dd2833', entityId: '019fae4871e877318899a79d88ad529d' },
      { relationId: '2b429206dc524b3b8d594ea68e713895', entityId: '01a0448a61d371018434a20fdadf6f97' },
    ],
  },
  {
    name: 'World affairs',
    id: '89bd89bf28ff8a0963faf92a8c905e20',
    address: '0xa50BcAd8EacCc1ec518972da4c28bf3cd2797493',
    targets: [
      { relationId: '6e17a7542b8f4f4894d6aff8bad0d84e', entityId: '019faedec88d76b3b4d03ab3b98d1ef5' },
      { relationId: 'a1005f049f2345fea7e8d0a923d97d36', entityId: '01a011b077cd78b2b366b9ca7ffc38d4' },
    ],
  },
];

const DRY_RUN = process.env.DRY_RUN !== '0';
const MODE = process.env.MODE === 'restore' ? 'restore' : 'untype';

async function main() {
  const config = getDebateAcceptorConfig();
  if (!config) throw new Error('acceptor not configured: need DEBATE_ACCEPTOR_PRIVATE_KEY and DEBATE_ACCEPTOR_SPACE_ID');

  const total = PLAN.reduce((n, s) => n + s.targets.length, 0);
  console.log(`GEO-2809 ${MODE}: ${total} relations across ${PLAN.length} spaces${DRY_RUN ? '  [DRY RUN]' : ''}`);
  console.log(`author space: ${config.spaceId}`);

  if (MODE === 'restore') {
    throw new Error('restore is not wired: geo-sdk exposes no restoreRelation op builder. Re-add via relations.create with the same ids.');
  }

  const signer = privateKeyToAccount(config.privateKey);
  const network = config.rpcUrl
    ? defineGeoNetworkConfig({ ...GEO_NETWORK, chain: { ...GEO_NETWORK.chain!, rpcUrl: config.rpcUrl } })
    : GEO_NETWORK;

  const smartAccount = DRY_RUN ? null : await generateZeroDevAccount({ signer, network });
  if (smartAccount) console.log(`signing as: ${smartAccount.account?.address ?? '(unknown)'}`);

  for (const space of PLAN) {
    const ops = space.targets.flatMap(t => relations.delete({ id: t.relationId }).ops);
    console.log(`\n=== ${space.name} (${space.id}) — ${ops.length} ops`);
    for (const t of space.targets) console.log(`    ${t.relationId}  <- entity ${t.entityId}`);

    if (DRY_RUN || !smartAccount) {
      console.log('    [dry run] would proposeEdit FAST + vote YES');
      continue;
    }

    const proposal = await geo.daoSpaces.proposeEdit({
      name: 'Untype hidden debates (GEO-2809)',
      ops,
      author: config.spaceId,
      callerSpaceId: `0x${config.spaceId}`,
      daoSpaceId: `0x${space.id}`,
      votingMode: 'FAST',
    });

    const createHash = await smartAccount.sendUserOperation({
      calls: [{ to: proposal.to as `0x${string}`, value: 0n, data: proposal.calldata as `0x${string}` }],
    });
    await smartAccount.waitForUserOperationReceipt({ hash: createHash });
    console.log(`    proposal ${proposal.proposalId} created`);

    const vote = geo.daoSpaces.voteProposal({
      authorSpaceId: config.spaceId,
      spaceId: space.id,
      proposalId: proposal.proposalId,
      vote: 'YES',
    });
    const voteHash = await smartAccount.sendUserOperation({
      calls: [{ to: vote.to as `0x${string}`, value: 0n, data: vote.calldata as `0x${string}` }],
    });
    await smartAccount.waitForUserOperationReceipt({ hash: voteHash });
    console.log(`    voted YES — ${space.name} done`);
  }

  console.log('\nVerify with: scratchpad/backfill/verify.sh  (expect 0 / 12 still typed)');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
