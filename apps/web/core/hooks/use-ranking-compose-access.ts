'use client';

import { useGeoLogin } from '@geogenesis/auth';
import { useQueryClient } from '@tanstack/react-query';

import { useCallback, useRef } from 'react';

import { useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { ensureSpaceMembership } from '~/core/access/request-space-membership';
import { normalizeSpaceId } from '~/core/access/space-access';
import { trackPrivyAuth } from '~/core/analytics';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { useSpace } from '~/core/hooks/use-space';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

export type RankingComposeAccessStatus =
  'loading' | 'needs-login' | 'needs-onboarding' | 'needs-membership' | 'not-found' | 'ready';

export function useRankingComposeAccess(spaceId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace, isFetched } = usePersonalSpaceId();
  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const { canEdit, isLoading: isLoadingAccess } = useAccessControl(spaceId);
  const tx = useSmartAccountTransaction();
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);
  const postLoginRedirectRef = useRef<string | null>(null);

  const { login } = useGeoLogin({
    onComplete: args => {
      trackPrivyAuth(args, { auth_flow: 'manual_login' });

      const postLoginRedirect = postLoginRedirectRef.current;
      postLoginRedirectRef.current = null;
      if (postLoginRedirect) {
        // Logged-out compose entry goes straight to compose after auth. If the
        // account is new, the compose screen records this URL for onboarding.
        router.push(postLoginRedirect);
      }
    },
  });

  const isLoading = isLoadingPersonalSpace || isLoadingSpace || isLoadingAccess;

  const status: RankingComposeAccessStatus = (() => {
    if (isLoadingSmartAccount) return 'loading';
    if (!smartAccount) return 'needs-login';
    if (isLoading || !isFetched) return 'loading';
    if (!isRegistered || !personalSpaceId) return 'needs-onboarding';
    if (!space) return 'not-found';
    if (space.type === 'DAO' && !canEdit) return 'needs-membership';
    return 'ready';
  })();

  const promptLogin = useCallback(
    (postLoginRedirect?: string) => {
      postLoginRedirectRef.current = postLoginRedirect ?? null;
      setName('');
      setTopicId('');
      setAvatar('');
      setSpaceId('');
      setStep('start');
      login();
    },
    [setName, setTopicId, setAvatar, setSpaceId, setStep, login]
  );

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (!smartAccount || !isRegistered || !personalSpaceId) {
      return false;
    }

    return ensureSpaceMembership({ spaceId, personalSpaceId, tx, queryClient });
  }, [smartAccount, isRegistered, personalSpaceId, spaceId, tx, queryClient]);

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
