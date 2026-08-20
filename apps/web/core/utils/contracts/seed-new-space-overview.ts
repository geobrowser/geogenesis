import { Effect } from 'effect';
import type { Hex } from 'viem';

import { executeFastProposal } from '~/core/hooks/use-publish';
import type { useSmartAccount } from '~/core/hooks/use-smart-account';
import { geo } from '~/core/sdk/geo-client';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

import { devLog } from '../dev-log';
import { generateNewSpaceTemplateOps } from './generate-new-space-template';

type SmartAccount = NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;

type SeedNewSpaceOverviewParams = {
  smartAccount: SmartAccount;
  spaceId: string;
  spaceAddress: Hex;
  spaceHomeEntityId: string;
  authorSpaceId: string;
};

/**
 * Publishes the new-space overview template into a space that already exists.
 */
export async function seedNewSpaceOverview({
  smartAccount,
  spaceId,
  spaceAddress,
  spaceHomeEntityId,
  authorSpaceId,
}: SeedNewSpaceOverviewParams): Promise<void> {
  const ops = generateNewSpaceTemplateOps({ spaceId, spaceHomeEntityId });

  const proposal = await geo.daoSpaces.proposeEdit({
    name: 'Set up space overview',
    ops,
    author: authorSpaceId,
    callerSpaceId: `0x${authorSpaceId}`,
    daoSpaceId: `0x${spaceId}`,
    votingMode: 'FAST',
  });

  const createUserOpHash = await smartAccount.sendUserOperation({
    calls: [{ to: proposal.to as Hex, value: 0n, data: proposal.calldata as Hex }],
  });

  const result = await runEffectEither(
    executeFastProposal({
      smartAccount,
      author: authorSpaceId,
      spaceId,
      daoSpaceAddress: spaceAddress,
      proposalId: proposal.proposalId as Hex,
      createUserOpHash,
    }).pipe(Effect.withSpan('web.write.createSpace.dao.seedOverview'))
  );

  if (result._tag === 'Left') throw result.left;

  devLog('[create-space] overview template seeded into %s', spaceId);
}
