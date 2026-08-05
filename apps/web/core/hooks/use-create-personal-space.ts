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
};

export function useCreatePersonalSpace() {
  const { smartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ spaceName, spaceImage, topicId }: CreatePersonalSpaceArgs): Promise<string | null> => {
      if (!smartAccount) return null;

      const walletAddress = smartAccount.account.address;

      // Onboarding is idempotent: if the account already has a registered space, return it
      // without republishing its content.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId) return existingSpaceId;

      return createPersonalSpaceOnChain({
        smartAccount,
        walletAddress,
        type: 'personal',
        spaceName,
        spaceAvatarUri: spaceImage,
        topicId,
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
