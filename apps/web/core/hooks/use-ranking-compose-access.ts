'use client';

import { useQueryClient } from '@tanstack/react-query';

import { useCallback } from 'react';

import { useSetAtom } from 'jotai';

import { ensureSpaceMembership } from '~/core/access/request-space-membership';
import { normalizeSpaceId } from '~/core/access/space-access';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';
import { useAccountReadiness } from '~/core/wallet/account-readiness';

import { postOnboardingRedirectAtom } from '~/atoms/post-onboarding-redirect';

export type RankingComposeAccessStatus =
  'loading' | 'needs-login' | 'needs-onboarding' | 'needs-membership' | 'not-found' | 'ready';

/**
 * Where the viewer stands. Waits on an answer from the index: a failed personal-space fetch reads
 * as unregistered, and treating it as "needs onboarding" opened the profile prompt during outages.
 */
export function rankingComposeAccessStatus(input: {
  isLoadingSmartAccount: boolean;
  address: string | null | undefined;
  isLoading: boolean;
  hasAnswer: boolean;
  isRegistered: boolean;
  personalSpaceId: string | null;
  space: { type: string } | null | undefined;
  canEdit: boolean;
}): RankingComposeAccessStatus {
  if (input.isLoadingSmartAccount) return 'loading';
  if (!input.address) return 'needs-login';
  if (input.isLoading || !input.hasAnswer) return 'loading';
  if (!input.isRegistered || !input.personalSpaceId) return 'needs-onboarding';
  if (!input.space) return 'not-found';
  if (input.space.type === 'DAO' && !input.canEdit) return 'needs-membership';
  return 'ready';
}

/**
 * Whether this status sends the viewer through sign-in or onboarding — and so needs a return address
 * to come back to compose.
 *
 * Not while a new account's space is being created: onboarding is done and the space is on its way,
 * so there is nothing to send them through, and a return address left set then is one
 * `PostAuthRedirect` follows once the space registers — pulling them back to compose from wherever
 * they went since.
 */
export function rankingComposeNeedsAccountStep(status: RankingComposeAccessStatus, isAccountSetupPending: boolean) {
  return status === 'needs-login' || (status === 'needs-onboarding' && !isAccountSetupPending);
}

export function useRankingComposeAccess(spaceId: string, rankingId?: string) {
  const queryClient = useQueryClient();
  const { state: accountState, address } = useAccountReadiness();
  const isLoadingSmartAccount = accountState === 'restoring';
  const { personalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace, hasAnswer } = usePersonalSpaceId();
  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const { canEdit, isLoading: isLoadingAccess } = useAccessControl(spaceId);
  const tx = useSmartAccountTransaction();
  const setPostOnboardingRedirect = useSetAtom(postOnboardingRedirectAtom);

  const promptSignIn = usePrivySignIn();

  const isLoading = isLoadingPersonalSpace || isLoadingSpace || isLoadingAccess;

  const status = rankingComposeAccessStatus({
    isLoadingSmartAccount,
    address,
    isLoading,
    hasAnswer,
    isRegistered,
    personalSpaceId,
    space,
    canEdit,
  });

  const promptLogin = useCallback(
    (postLoginRedirect?: string) => {
      // Into the app-level return address rather than anything this hook holds: the ranking block
      // that called it can unmount while the viewer signs up. `PostAuthRedirect` follows it for an
      // existing account, and onboarding does for a new one, once their profile is made.
      promptSignIn(
        {
          component: 'ranking_composer',
          target_type: rankingId ? 'ranking' : 'space',
          target_id: rankingId ?? spaceId,
          auth_control: 'add_ranking',
          auth_intent: 'ranking',
          auth_continuation: 'resume',
        },
        {
          redirectTo: postLoginRedirect,
          // A dismissed sign-in drops the destination, so a later, unrelated sign-in doesn't land
          // on the compose screen.
          onCancel: () => setPostOnboardingRedirect(null),
        }
      );
    },
    [promptSignIn, setPostOnboardingRedirect, spaceId, rankingId]
  );

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (!address || !isRegistered || !personalSpaceId) {
      return false;
    }

    return ensureSpaceMembership({ spaceId, personalSpaceId, tx, queryClient });
  }, [address, isRegistered, personalSpaceId, spaceId, tx, queryClient]);

  const recheckAccess = useCallback(() => {
    if (!personalSpaceId) return;

    const normalizedSpaceId = normalizeSpaceId(spaceId);
    const normalizedPersonalSpaceId = normalizeSpaceId(personalSpaceId);

    void queryClient.invalidateQueries({
      queryKey: ['space-access-control', 'member', normalizedSpaceId, normalizedPersonalSpaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['space-access-control', 'editor', normalizedSpaceId, normalizedPersonalSpaceId],
    });
  }, [queryClient, spaceId, personalSpaceId]);

  return { status, canEdit, promptLogin, ensureAccess, recheckAccess, isLoading };
}
