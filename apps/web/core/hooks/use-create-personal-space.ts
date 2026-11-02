'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { needsPersonalProfile } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import {
  createPersonalSpaceOnChain,
  hasDeclaredPersonalTopic,
  readRegisteredSpaceId,
} from '~/core/utils/contracts/create-personal-space-on-chain';

/**
 * Whether a registered space still lacks its profile, so a re-run should publish it.
 *
 * The index decides first; a failed read throws and the runner offers the retry. When the index
 * says "missing" the chain gets the last word, because the index can trail a publish another
 * browser already landed, and publishing again there writes a second profile under a fresh topic
 * id. A failed chain read keeps the index's answer: it only ever narrows that window, and must not
 * strand an account whose profile really is missing.
 */
async function profileStillMissing(spaceId: string, walletAddress: string) {
  const space = await Effect.runPromise(getSpace(spaceId));
  if (!needsPersonalProfile(space, walletAddress)) return false;
  try {
    return !(await hasDeclaredPersonalTopic(spaceId));
  } catch (error) {
    console.warn('[CREATE_SPACE] topic declaration read failed; trusting the index', error);
    return true;
  }
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

      // Return an already-registered space without republishing, but only once its profile
      // is published. An account whose profile never landed has no page, and geo-chat refuses
      // it a session for good; returning here for it is how the onboarding retry (#2855) said
      // "completed" while publishing nothing. Falling through is safe: the on-chain flow skips
      // the registration it already has and publishes only the profile.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId && !(await profileStillMissing(existingSpaceId, walletAddress))) {
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
