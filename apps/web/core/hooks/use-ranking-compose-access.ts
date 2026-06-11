'use client';

import { useCallback, useRef } from 'react';

import { Either } from 'effect';

import { getSpaceAccessById } from '~/core/access/space-access';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpace } from '~/core/hooks/use-space';
import { useSignInPrompt } from '~/core/state/sign-in-prompt-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

export type RankingComposeAccessStatus = 'loading' | 'needs-login' | 'needs-onboarding' | 'needs-membership' | 'ready';

export function useRankingComposeAccess(spaceId: string) {
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const { open: openSignInPrompt } = useSignInPrompt();
  const { personalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace, isFetched } = usePersonalSpaceId();
  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const { canEdit, isLoading: isLoadingAccess } = useAccessControl(spaceId);
  const { requestToBeMember, status: membershipRequestStatus } = useRequestToBeMember({ spaceId });
  const membershipRequestedRef = useRef(false);

  const isLoading = isLoadingPersonalSpace || isLoadingSpace || isLoadingAccess;

  const status: RankingComposeAccessStatus = (() => {
    if (isLoadingSmartAccount) return 'loading';
    if (!smartAccount) return 'needs-login';
    if (isLoading || !isFetched) return 'loading';
    if (!isRegistered || !personalSpaceId) return 'needs-onboarding';
    if (space?.type === 'DAO' && !canEdit) return 'needs-membership';
    return 'ready';
  })();

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (!smartAccount) {
      openSignInPrompt('join');
      return false;
    }

    if (!isRegistered || !personalSpaceId) {
      return false;
    }

    if (space?.type === 'DAO' && !canEdit) {
      const access = await runEffectEither(getSpaceAccessById(spaceId, personalSpaceId));
      if (Either.isRight(access) && access.right.canEdit) {
        return true;
      }

      if (!membershipRequestedRef.current && membershipRequestStatus !== 'pending') {
        membershipRequestedRef.current = true;
        requestToBeMember();
      }
      return false;
    }

    return true;
  }, [
    smartAccount,
    openSignInPrompt,
    isRegistered,
    personalSpaceId,
    space?.type,
    canEdit,
    spaceId,
    membershipRequestStatus,
    requestToBeMember,
  ]);

  return { status, ensureAccess, isLoading };
}
