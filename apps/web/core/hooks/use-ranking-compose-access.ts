'use client';

import { useGeoLogin } from '@geogenesis/auth';

import { useCallback } from 'react';

import { useSetAtom } from 'jotai';

import { trackPrivyAuth } from '~/core/analytics';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

export type RankingComposeAccessStatus = 'loading' | 'needs-login' | 'needs-onboarding' | 'ready';

export function useRankingComposeAccess(_spaceId: string) {
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace, isFetched } = usePersonalSpaceId();
  const setName = useSetAtom(nameAtom);
  const setTopicId = useSetAtom(topicIdAtom);
  const setAvatar = useSetAtom(avatarAtom);
  const setSpaceId = useSetAtom(spaceIdAtom);
  const setStep = useSetAtom(stepAtom);

  const { login } = useGeoLogin({
    onComplete: args => trackPrivyAuth(args, { auth_flow: 'manual_login' }),
  });

  const isLoading = isLoadingPersonalSpace;

  const status: RankingComposeAccessStatus = (() => {
    if (isLoadingSmartAccount) return 'loading';
    if (!smartAccount) return 'needs-login';
    if (isLoading || !isFetched) return 'loading';
    if (!isRegistered || !personalSpaceId) return 'needs-onboarding';
    return 'ready';
  })();

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (!smartAccount) {
      setName('');
      setTopicId('');
      setAvatar('');
      setSpaceId('');
      setStep('start');
      login();
      return false;
    }

    if (!isRegistered || !personalSpaceId) {
      return false;
    }

    return true;
  }, [
    smartAccount,
    isRegistered,
    personalSpaceId,
    setName,
    setTopicId,
    setAvatar,
    setSpaceId,
    setStep,
    login,
  ]);

  return { status, ensureAccess, isLoading };
}
