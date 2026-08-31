'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import {
  createPersonalSpaceOnChain,
  readRegisteredSpaceId,
} from '~/core/utils/contracts/create-personal-space-on-chain';

type CreatePersonalSpaceArgs = {
  spaceName: string;
  spaceImage?: string;
  topicId?: string;
  onRegistered?: (spaceId: string) => void;
};

export function useCreatePersonalSpace() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      spaceName,
      spaceImage,
      topicId,
      onRegistered,
    }: CreatePersonalSpaceArgs): Promise<string | null> => {
      if (!smartAccount) return null;

      const walletAddress = smartAccount.account.address;

      // Return an already-registered space without republishing.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId) {
        try {
          onRegistered?.(existingSpaceId);
        } catch (error) {
          console.error('[CREATE_SPACE] onRegistered callback failed', error);
        }
        return existingSpaceId;
      }

      return createPersonalSpaceOnChain({
        smartAccount,
        walletAddress,
        type: 'personal',
        spaceName,
        spaceAvatarUri: spaceImage,
        topicId,
        onRegistered,
      });
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
