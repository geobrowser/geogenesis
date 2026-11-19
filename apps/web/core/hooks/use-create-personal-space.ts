'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { awaitSigningAccount } from '~/core/hooks/cached-write-identity';
import {
  markPersonalProfilePublished,
  needsPersonalProfile,
  personalEntityIdOf,
} from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { getSpace } from '~/core/io/queries';
import {
  createPersonalSpaceOnChain,
  findPersonalProfileDeclaration,
  readRegisteredSpaceId,
  republishPersonalProfile,
} from '~/core/utils/contracts/create-personal-space-on-chain';
import {
  type ProfileRetryDecision,
  ProfileStillProcessingError,
  decideProfileRetry,
} from '~/core/utils/contracts/personal-profile-recovery';

/**
 * What a re-run should do for a registered space, or null when its profile is already published.
 *
 * The index decides first; a failed read throws and the runner offers the retry. When the index
 * says "missing" the chain gets the last word. It can show a profile publish the index has not
 * served yet: recent, from another browser, which must not publish a second profile; or older,
 * which the index dropped and must be republished with the same ids. A failed chain read keeps the
 * index's answer: it must not strand an account whose profile really is missing.
 */
async function profileRetryDecision(spaceId: string, walletAddress: string) {
  const space = await Effect.runPromise(getSpace(spaceId));
  if (!needsPersonalProfile(space, walletAddress)) return { done: true as const, space };
  let decision: ProfileRetryDecision;
  try {
    decision = decideProfileRetry(await findPersonalProfileDeclaration(spaceId), Date.now());
  } catch (error) {
    console.warn('[CREATE_SPACE] profile declaration read failed; trusting the index', error);
    decision = { kind: 'publish-fresh' };
  }
  return { done: false as const, decision };
}

type CreatePersonalSpaceArgs = {
  spaceName: string;
  spaceImage?: string;
  topicId?: string;
  /** Called once the profile is on its way, with the space id and, when known, its person entity. */
  onRegistered?: (spaceId: string, profileEntityId?: string) => void;
};

export function useCreatePersonalSpace() {
  const { smartAccount: liveSmartAccount } = useSmartAccount();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      spaceName,
      spaceImage,
      topicId,
      onRegistered,
    }: CreatePersonalSpaceArgs): Promise<string | null> => {
      const smartAccount = await awaitSigningAccount(liveSmartAccount);
      if (!smartAccount) return null;

      const walletAddress = smartAccount.account.address;

      // Return an already-registered space without republishing, but only once its profile
      // is published. An account whose profile never landed has no page, and geo-chat refuses
      // it a session for good; returning here for it is how the onboarding retry (#2855) said
      // "completed" while publishing nothing. Falling through is safe: the on-chain flow skips
      // the registration it already has and publishes only the profile.
      const existingSpaceId = await readRegisteredSpaceId(walletAddress);
      if (existingSpaceId) {
        const retry = await profileRetryDecision(existingSpaceId, walletAddress);
        if (retry.done) {
          try {
            onRegistered?.(existingSpaceId, (retry.space && personalEntityIdOf(retry.space)) ?? undefined);
          } catch (error) {
            console.error('[CREATE_SPACE] onRegistered callback failed', error);
          }
          return existingSpaceId;
        }

        const { decision } = retry;
        if (decision.kind === 'processing') {
          // Keep the prompt away until the index has had its chance, counted from the chain's time
          // rather than now, so retrying can't push it back. Past that, a retry republishes.
          markPersonalProfilePublished(walletAddress, decision.declaration.declaredAtMs);
          throw new ProfileStillProcessingError(decision.declaration.declaredAtMs, decision.declaration.topicId);
        }
        if (decision.kind === 'republish') {
          return republishPersonalProfile({
            smartAccount,
            spaceId: existingSpaceId,
            declaration: decision.declaration,
            spaceName,
            spaceAvatarUri: spaceImage,
            onRegistered,
          });
        }
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
