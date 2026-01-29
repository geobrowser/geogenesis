'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/v2/queries';
import { generateOpsForSpaceType } from '~/core/utils/contracts/generate-ops-for-space-type';
import { getPersonalSpaceId } from '~/core/utils/contracts/get-personal-space-id';
import { getImagePath } from '~/core/utils/utils';

type CreatePersonalSpaceArgs = {
  spaceName: string;
  spaceImage?: string;
  entityId?: string;
};

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

      // 1. Register space ID using SDK
      const { to: registryTo, calldata: registryCalldata } = personalSpace.createSpace();
      await smartAccount.sendUserOperation({
        calls: [{ to: registryTo, value: 0n, data: registryCalldata }],
      });

      // 2. Wait for space ID to be available (transaction confirmation)
      const spaceId = await waitForSpaceId(walletAddress);
      if (!spaceId) {
        throw new Error('Timed out waiting for space ID after registration.');
      }

      // 3. Generate ops for personal space content
      const { ops } = await generateOpsForSpaceType({
        type: 'personal',
        spaceName,
        spaceAvatarUri: spaceImage ? getImagePath(spaceImage) : null,
        spaceCoverUri: null,
        initialEditorAddress: walletAddress,
        entityId,
      });

      // 4. Publish ops using SDK (uploads to IPFS + encodes enter() calldata)
      const { to: publishTo, calldata: publishCalldata } = await personalSpace.publishEdit({
        name: spaceName,
        spaceId,
        ops,
        author: walletAddress,
        network: 'TESTNET',
      });

      // 5. Submit to space registry
      await smartAccount.sendUserOperation({
        calls: [{ to: publishTo, value: 0n, data: publishCalldata }],
      });

      // 6. Wait for content to be indexed
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
