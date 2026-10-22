'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { recentlyPublishedProfile } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import {
  createPersonalSpaceOnChain,
  readRegisteredSpaceId,
} from '~/core/utils/contracts/create-personal-space-on-chain';

/**
 * Whether a registered space already has its profile, or this browser just sent it.
 *
 * The local mark covers the indexer lag: a reload right after the publish was sent would
 * otherwise read "no profile" and publish it a second time. A space the index has not served
 * yet counts as having none — that is the reload-between-registration-and-publish case, where
 * the profile really was never sent. A failed read throws rather than guessing either way;
 * the runner then offers the retry.
 */
async function hasPublishedProfile(spaceId: string, walletAddress: string) {
  if (recentlyPublishedProfile(walletAddress)) return true;
  const space = await Effect.runPromise(getSpace(spaceId));
  return space?.hasProfile ?? false;
}

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

      // Return an already-registered space without republishing — but only once its profile
      // is published. Registered alone is not finished: an account whose profile publish
      // never landed has a space with no name and no page, and geo-chat refuses it a session
      // for good. Returning here for that account is how the onboarding retry (#2855) said
      // "completed" while publishing nothing. Falling through instead is safe:
      // `createPersonalSpaceOnChain` skips the registration it already has and publishes only
      // the profile.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId && (await hasPublishedProfile(existingSpaceId, walletAddress))) {
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
