'use client';

import { getCreateDaoSpaceCalldata } from '@geoprotocol/geo-sdk';
import { DaoSpaceFactoryAbi } from '@geoprotocol/geo-sdk/abis';
import { Ipfs } from '@geoprotocol/geo-sdk/lite';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect, Either } from 'effect';
import { type Hex, createPublicClient, http } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import { createPersonalSpaceOnChain, waitForSpaceIndexed } from '~/core/utils/contracts/create-personal-space-on-chain';
import {
  DAO_SPACE_FACTORY_ADDRESS,
  EMPTY_SPACE_ID,
  NEW_SPACE_VOTING_DURATION_DAYS,
} from '~/core/utils/contracts/dao-space-factory';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';
import { SPACE_REGISTRY_ADDRESS_HEX, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';
import { getImagePath } from '~/core/utils/utils';
import { GEOGENESIS } from '~/core/wallet/geo-chain';

type DeployArgs = {
  type: SpaceType;
  spaceName: string;
  spaceImage?: string;
  governanceType?: SpaceGovernanceType;
  topicId?: string;
};

const PUBLIC_GOVERNANCE_TYPES: SpaceType[] = [
  'dao',
  'academic-field',
  'company',
  'government-org',
  'industry',
  'interest',
  'nonprofit',
  'region',
  'protocol',
];

async function runWriteEffect<A>(effect: Effect.Effect<A, Error>): Promise<A> {
  const result = await runEffectEither(effect);

  if (Either.isLeft(result)) {
    throw result.left;
  }

  return result.right;
}

export function useDeploySpace() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const { mutateAsync } = useMutation({
    mutationFn: async (args: DeployArgs): Promise<string | null> => {
      if (!smartAccount) {
        return null;
      }

      const walletAddress = smartAccount.account.address;
      if (!walletAddress) {
        return null;
      }

      const { spaceName, type, governanceType, spaceImage, topicId } = args;

      const isPublicGovernance = determineIsPublicGovernance(type, governanceType);

      if (isPublicGovernance) {
        return await createDaoSpace({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceCoverUri: spaceImage,
          topicId,
        });
      } else {
        // Non-DAO governance types (personal, company, nonprofit, …) share onboarding's
        // register -> publish+topic -> index flow.
        return await createPersonalSpaceOnChain({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceAvatarUri: type === 'personal' || type === 'company' ? spaceImage : undefined,
          spaceCoverUri: type !== 'personal' && type !== 'company' ? spaceImage : undefined,
          topicId,
        });
      }
    },
    onSuccess: spaceId => {
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['spaces'] });
        queryClient.invalidateQueries({ queryKey: ['personal-space-id'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }
    },
  });

  return {
    deploy: mutateAsync,
  };
}

function determineIsPublicGovernance(type: SpaceType, governanceType?: SpaceGovernanceType): boolean {
  if (type === 'default') {
    return governanceType === 'DAO';
  }

  if (PUBLIC_GOVERNANCE_TYPES.includes(type)) {
    return true;
  }

  return false;
}

type CreateDaoSpaceParams = {
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  walletAddress: string;
  type: SpaceType;
  spaceName: string;
  spaceCoverUri?: string;
  topicId?: string;
};

async function createDaoSpace({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceCoverUri,
  topicId,
}: CreateDaoSpaceParams): Promise<string> {
  const personalSpaceId = await getPersonalSpaceId(walletAddress);
  if (!personalSpaceId) {
    throw new Error(
      'You must complete onboarding and create a personal space before creating a DAO space. Your personal space is required for governance membership.'
    );
  }

  const { ops, topicId: resolvedTopicId } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    topicId,
  });

  const { cid } = await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        Ipfs.publishEdit({
          name: `Create ${spaceName} space`,
          ops,
          author: personalSpaceId,
          network: 'TESTNET',
        }),
      catch: error => new Error('Failed to publish DAO space edit to IPFS', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.dao.publishEdit'),
      Effect.annotateSpans({
        'io.operation': 'publish_edit',
        'io.path': 'dao',
        'space.type': 'DAO',
        'governance.action': 'space_created',
      })
    )
  );

  if (!cid) {
    throw new Error('Failed to upload space content to IPFS');
  }

  const userSpaceIdHex = `0x${personalSpaceId}` as Hex;

  const publicClient = createPublicClient({
    chain: GEOGENESIS,
    transport: http(),
  });

  const [spaceRegistryAddr, daoSpaceBeaconAddr] = await Promise.all([
    publicClient.readContract({
      address: DAO_SPACE_FACTORY_ADDRESS,
      abi: DaoSpaceFactoryAbi,
      functionName: 'spaceRegistry',
    }),
    publicClient.readContract({
      address: DAO_SPACE_FACTORY_ADDRESS,
      abi: DaoSpaceFactoryAbi,
      functionName: 'daoSpaceBeacon',
    }),
  ]);

  if (spaceRegistryAddr === '0x0000000000000000000000000000000000000000') {
    throw new Error('DAOSpaceFactory is not properly initialized: spaceRegistry is zero address');
  }
  if (daoSpaceBeaconAddr === '0x0000000000000000000000000000000000000000') {
    throw new Error('DAOSpaceFactory is not properly initialized: daoSpaceBeacon is zero address');
  }

  // TODO(GEO-2120/2105): when SDK 0.20.x ships and testnet redeploys with the 6-arg ABI,
  // rename to the 7-field VotingSettingsInput (partialPercentageSupportThreshold, etc.).
  const calldata = getCreateDaoSpaceCalldata({
    votingSettings: {
      slowPathPercentageThreshold: 51,
      fastPathFlatThreshold: 0,
      quorum: 1,
      durationInDays: NEW_SPACE_VOTING_DURATION_DAYS,
    },
    initialEditorSpaceIds: [userSpaceIdHex],
    initialMemberSpaceIds: [userSpaceIdHex],
    initialEditsContentUri: cid,
    initialTopicId: resolvedTopicId,
  });

  const txHash = await runWriteEffect(
    Effect.tryPromise({
      try: () =>
        smartAccount.sendTransaction({
          to: DAO_SPACE_FACTORY_ADDRESS,
          data: calldata,
        }),
      catch: error => new Error('Failed to submit DAO space creation transaction', { cause: error }),
    }).pipe(
      Effect.withSpan('web.write.createSpace.dao.sendTransaction'),
      Effect.annotateSpans({
        'io.operation': 'create_space',
        'space.type': 'DAO',
        'governance.action': 'space_created',
      })
    )
  );

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== 'success') {
    throw new Error('DAO space creation transaction failed');
  }

  const newDaoSpaceAddress = await findNewDaoSpaceAddress(publicClient, receipt);
  if (!newDaoSpaceAddress) {
    throw new Error('Could not find new DAO space address from transaction logs');
  }

  const newSpaceIdHex = (await publicClient.readContract({
    address: SPACE_REGISTRY_ADDRESS_HEX,
    abi: SpaceRegistryAbi,
    functionName: 'addressToSpaceId',
    args: [newDaoSpaceAddress],
  })) as Hex;

  const newSpaceId = newSpaceIdHex.slice(2).toLowerCase();
  // DAO deploys index slower than personal spaces; keep the original ~120s ceiling.
  const indexed = await waitForSpaceIndexed(newSpaceId, resolvedTopicId, 40, 3_000);
  if (!indexed) {
    throw new Error('Timed out waiting for DAO space to index.');
  }

  return newSpaceId;
}

async function findNewDaoSpaceAddress(publicClient: any, receipt: any): Promise<Hex | null> {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === DAO_SPACE_FACTORY_ADDRESS.toLowerCase()) continue;
    if (log.address.toLowerCase() === SPACE_REGISTRY_ADDRESS_HEX.toLowerCase()) continue;

    const code = await publicClient.getCode({ address: log.address });
    if (code && code !== '0x') {
      try {
        const spaceId = (await publicClient.readContract({
          address: SPACE_REGISTRY_ADDRESS_HEX,
          abi: SpaceRegistryAbi,
          functionName: 'addressToSpaceId',
          args: [log.address],
        })) as Hex;

        if (spaceId && spaceId.toLowerCase() !== EMPTY_SPACE_ID.toLowerCase()) {
          return log.address;
        }
      } catch {
        // Not a registered space
      }
    }
  }

  return null;
}
