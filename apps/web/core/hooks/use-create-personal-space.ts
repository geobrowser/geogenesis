'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';

import { awaitSigningAccount } from '~/core/hooks/cached-write-identity';
import {
  indexLacksPersonalProfile,
  markPersonalProfilePublished,
  personalEntityIdOf,
  recentlyPublishedProfile,
} from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import type { Space } from '~/core/io/dto/spaces';
import { getSpace } from '~/core/io/queries';
import {
  createPersonalSpaceOnChain,
  findPersonalProfileDeclaration,
  readRegisteredSpaceId,
  republishPersonalProfile,
} from '~/core/utils/contracts/create-personal-space-on-chain';
import {
  ProfileRecoveryError,
  type ProfileRetryDecision,
  ProfileStillProcessingError,
  decideProfileRetry,
} from '~/core/utils/contracts/personal-profile-recovery';

/**
 * What a re-run should do for a registered space, or `done` when the index serves its profile.
 *
 * Only the index decides `done`; this browser's grace window must not, or a retry inside it
 * returns success with nothing published. When the index says "missing" the chain decides. A
 * failed chain read throws a retryable error rather than publishing fresh ids next to a profile
 * the chain may already have.
 */
async function profileRetryDecision(spaceId: string, walletAddress: string) {
  let space: Space | null;
  try {
    space = await Effect.runPromise(getSpace(spaceId));
  } catch (error) {
    throw new ProfileRecoveryError('The profile could not be read from the index.', { cause: error });
  }
  if (!indexLacksPersonalProfile(space)) return { done: true as const, space };
  let decision: ProfileRetryDecision;
  try {
    decision = decideProfileRetry(await findPersonalProfileDeclaration(spaceId), {
      now: Date.now(),
      recentLocalPublish: recentlyPublishedProfile(walletAddress),
    });
  } catch (error) {
    throw new ProfileRecoveryError('The profile publish could not be read from the chain.', { cause: error });
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
          const { declaration } = decision;
          // Keep the prompt away while the index has its chance, counted from the chain's time
          // rather than now, so retrying can't push it back. Past that, a retry republishes.
          if (declaration) markPersonalProfilePublished(walletAddress, declaration.lastPublishedAtMs);
          throw new ProfileStillProcessingError(
            declaration?.lastPublishedAtMs ?? Date.now(),
            declaration?.topicId ?? null
          );
        }
        if (decision.kind === 'republish') {
          return republishPersonalProfile({
            smartAccount,
            walletAddress,
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
