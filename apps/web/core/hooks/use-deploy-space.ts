'use client';

import { Ipfs, personalSpace } from '@geoprotocol/geo-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { type Hex, createPublicClient, encodeAbiParameters, encodeFunctionData, http } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import { SpaceGovernanceType, SpaceType } from '~/core/types';
import {
  DAO_SPACE_FACTORY_ADDRESS,
  DEFAULT_VOTING_SETTINGS,
  DaoSpaceFactoryAbi,
  EMPTY_SPACE_ID,
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
  entityId?: string;
};

const PUBLIC_GOVERNANCE_TYPES: SpaceType[] = ['dao', 'academic-field', 'industry', 'interest', 'region', 'protocol'];

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

      const { spaceName, type, governanceType, spaceImage, entityId } = args;

      const isPublicGovernance = determineIsPublicGovernance(type, governanceType);

      if (isPublicGovernance) {
        return await createDaoSpace({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceCoverUri: spaceImage,
          entityId,
        });
      } else {
        return await createPersonalStyleSpace({
          smartAccount,
          walletAddress,
          type,
          spaceName,
          spaceAvatarUri: type === 'personal' || type === 'company' ? spaceImage : undefined,
          spaceCoverUri: type !== 'personal' && type !== 'company' ? spaceImage : undefined,
          entityId,
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
  entityId?: string;
};

async function createDaoSpace({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceCoverUri,
  entityId,
}: CreateDaoSpaceParams): Promise<string> {
  const personalSpaceId = await getPersonalSpaceId(walletAddress);
  if (!personalSpaceId) {
    throw new Error(
      'You must complete onboarding and create a personal space before creating a DAO space. Your personal space is required for governance membership.'
    );
  }

  const { ops } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    entityId,
  });

  const { cid } = await Ipfs.publishEdit({
    name: `Create ${spaceName} space`,
    ops,
    author: walletAddress as Hex,
    network: 'TESTNET',
  });

  if (!cid) {
    throw new Error('Failed to upload space content to IPFS');
  }

  const userSpaceIdHex = `0x${personalSpaceId}` as Hex;
  const initialEditsContentUri = encodeAbiParameters([{ type: 'string' }], [cid]);

  const publicClient = createPublicClient({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chain: GEOGENESIS as any,
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

  const calldata = encodeFunctionData({
    abi: DaoSpaceFactoryAbi,
    functionName: 'createDAOSpaceProxy',
    args: [
      DEFAULT_VOTING_SETTINGS,
      [userSpaceIdHex],
      [userSpaceIdHex],
      initialEditsContentUri,
      '0x' as Hex,
      EMPTY_SPACE_ID,
      '0x' as Hex,
    ],
  });

  const txHash = await smartAccount.sendTransaction({
    to: DAO_SPACE_FACTORY_ADDRESS,
    data: calldata,
  });

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
  await waitForSpaceContent(newSpaceId);

  return newSpaceId;
}

type CreatePersonalStyleSpaceParams = {
  smartAccount: NonNullable<ReturnType<typeof useSmartAccount>['smartAccount']>;
  walletAddress: string;
  type: SpaceType;
  spaceName: string;
  spaceAvatarUri?: string;
  spaceCoverUri?: string;
  entityId?: string;
};

async function createPersonalStyleSpace({
  smartAccount,
  walletAddress,
  type,
  spaceName,
  spaceAvatarUri,
  spaceCoverUri,
  entityId,
}: CreatePersonalStyleSpaceParams): Promise<string> {
  let spaceId = await getPersonalSpaceId(walletAddress);

  if (!spaceId) {
    const { to: registryTo, calldata: registryCalldata } = personalSpace.createSpace();
    await smartAccount.sendUserOperation({
      calls: [{ to: registryTo, value: 0n, data: registryCalldata }],
    });

    spaceId = await waitForSpaceId(walletAddress);
    if (!spaceId) {
      throw new Error('Timed out waiting for space ID after registration.');
    }
  }

  const { ops } = await generateOpsForSpaceType({
    type,
    spaceName,
    spaceAvatarUri: spaceAvatarUri ? getImagePath(spaceAvatarUri) : null,
    spaceCoverUri: spaceCoverUri ? getImagePath(spaceCoverUri) : null,
    initialEditorAddress: walletAddress,
    entityId,
  });

  const { to: publishTo, calldata: publishCalldata } = await personalSpace.publishEdit({
    name: spaceName,
    spaceId,
    ops,
    author: walletAddress as Hex,
    network: 'TESTNET',
  });

  await smartAccount.sendUserOperation({
    calls: [{ to: publishTo, value: 0n, data: publishCalldata }],
  });

  await waitForSpaceContent(spaceId);

  return spaceId;
}

async function findNewDaoSpaceAddress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  receipt: any
): Promise<Hex | null> {
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

async function waitForSpaceId(walletAddress: string, maxAttempts = 30, intervalMs = 2_000): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const spaceId = await getPersonalSpaceId(walletAddress);
    if (spaceId) return spaceId;
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return null;
}

async function waitForSpaceContent(spaceId: string, maxAttempts = 20, intervalMs = 3_000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const space = await Effect.runPromise(getSpace(spaceId));
      if (space?.entity?.name) return true;
    } catch {
      // Continue polling
    }
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  return false;
}
