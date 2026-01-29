'use client';

import { Ipfs, personalSpace } from '@geoprotocol/geo-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';
import { type Hex, encodeAbiParameters, encodeFunctionData, keccak256, toHex } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/v2/queries';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';
import { EMPTY_TOPIC_HEX, SPACE_REGISTRY_ADDRESS_HEX, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';
import { getImagePath } from '~/core/utils/utils';

const EDITS_PUBLISHED_ACTION = keccak256(toHex('GOVERNANCE.EDITS_PUBLISHED'));

type CreatePersonalSpaceArgs = {
  spaceName: string;
  spaceImage?: string;
  entityId?: string;
};

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

async function waitForSpaceContent(spaceId: string, maxAttempts = 15, intervalMs = 2_000): Promise<boolean> {
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

export function useCreatePersonalSpace() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ spaceName, spaceImage, entityId }: CreatePersonalSpaceArgs): Promise<string | null> => {
      if (!smartAccount) return null;

      const walletAddress = smartAccount.account.address;

      // Check if user already has a personal space
      const existingSpaceId = await getPersonalSpaceId(walletAddress);
      if (existingSpaceId) return existingSpaceId;

      // Register space ID
      const { to: registryTo, calldata: registryCalldata } = personalSpace.createSpace();
      await smartAccount.sendUserOperation({
        calls: [{ to: registryTo, value: 0n, data: registryCalldata }],
      });

      // Wait for space ID to be available
      const spaceId = await waitForSpaceId(walletAddress);
      if (!spaceId) {
        throw new Error('Timed out waiting for space ID after registration.');
      }

      // Generate ops for personal space content
      const { ops } = await generateOpsForSpaceType({
        type: 'personal',
        spaceName,
        spaceAvatarUri: spaceImage ? getImagePath(spaceImage) : null,
        spaceCoverUri: null,
        initialEditorAddress: walletAddress,
        entityId,
      });

      // Upload ops to IPFS
      const { cid } = await Ipfs.publishEdit({
        name: spaceName,
        ops,
        author: walletAddress as Hex,
        network: 'TESTNET',
      });

      if (!cid) {
        throw new Error('Failed to upload to IPFS: CID is undefined');
      }

      // Publish to space via SpaceRegistry.enter()
      const spaceIdHex = `0x${spaceId}` as Hex;
      const cidData = encodeAbiParameters([{ type: 'string' }], [cid]);
      const publishCalldata = encodeFunctionData({
        abi: SpaceRegistryAbi,
        functionName: 'enter',
        args: [spaceIdHex, spaceIdHex, EDITS_PUBLISHED_ACTION, EMPTY_TOPIC_HEX, cidData, '0x'],
      });

      await smartAccount.sendUserOperation({
        calls: [{ to: SPACE_REGISTRY_ADDRESS_HEX, value: 0n, data: publishCalldata }],
      });

      // Wait for content to be indexed
      await waitForSpaceContent(spaceId);

      return spaceId;
    },
    onSuccess: spaceId => {
      if (spaceId) {
        queryClient.invalidateQueries({ queryKey: ['personal-space-id'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
      }
    },
  });

  return {
    createPersonalSpace: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
