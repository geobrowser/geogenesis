'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { needsPersonalProfile } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
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

      // Return an already-registered space without republishing, but only once its profile
      // is published. An account whose profile never landed has no page, and geo-chat refuses
      // it a session for good; returning here for it is how the onboarding retry (#2855) said
      // "completed" while publishing nothing. Falling through is safe: the on-chain flow skips
      // the registration it already has and publishes only the profile. A failed index read
      // throws, and the runner offers the retry.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId && !needsPersonalProfile(await Effect.runPromise(getSpace(existingSpaceId)), walletAddress)) {
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
