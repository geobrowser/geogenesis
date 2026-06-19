'use client';

import { useGeoLogin } from '@geogenesis/auth';

import { useCallback, useRef } from 'react';

import { Either } from 'effect';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { getSpaceAccessById, normalizeSpaceId } from '~/core/access/space-access';
import { trackPrivyAuth } from '~/core/analytics';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useRequestToBeMember } from '~/core/hooks/use-request-to-be-member';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useSpace } from '~/core/hooks/use-space';
import { hasActiveMemberProposal } from '~/core/io/subgraph/fetch-proposed-members';
import { runEffectEither } from '~/core/telemetry/effect-runtime';

import { avatarAtom, nameAtom, spaceIdAtom, stepAtom, topicIdAtom } from '~/partials/onboarding/dialog';

export type RankingComposeAccessStatus =
  | 'loading'
  | 'needs-login'
  | 'needs-onboarding'
  | 'needs-membership'
  | 'not-found'
  | 'ready';

/** Dedupes automatic membership requests across compose screen + embedded block mounts. */
const autoRequestedMemberships = new Set<string>();

export function useRankingComposeAccess(spaceId: string) {
  const router = useRouter();
  const { smartAccount, isLoading: isLoadingSmartAccount } = useSmartAccount();
  const { personalSpaceId, isRegistered, isLoading: isLoadingPersonalSpace, isFetched } = usePersonalSpaceId();
  const { space, isLoading: isLoadingSpace } = useSpace(spaceId);
  const { canEdit, isLoading: isLoadingAccess } = useAccessControl(spaceId);
  const { requestToBeMember, status: membershipRequestStatus } = useRequestToBeMember({ spaceId });
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

  const promptLogin = useCallback((postLoginRedirect?: string) => {
    postLoginRedirectRef.current = postLoginRedirect ?? null;
    setName('');
    setTopicId('');
    setAvatar('');
    setSpaceId('');
    setStep('start');
    login();
  }, [setName, setTopicId, setAvatar, setSpaceId, setStep, login]);

  const ensureMembership = useCallback(async (): Promise<boolean> => {
    if (!personalSpaceId) return false;

    const access = await runEffectEither(getSpaceAccessById(spaceId, personalSpaceId));
    if (Either.isRight(access) && access.right.canEdit) {
      return true;
    }

    if (isLoadingSpace) {
      return false;
    }

    if (space?.type === 'DAO') {
      const requestKey = `${normalizeSpaceId(spaceId)}:${normalizeSpaceId(personalSpaceId)}`;
      if (!autoRequestedMemberships.has(requestKey) && membershipRequestStatus !== 'pending') {
        autoRequestedMemberships.add(requestKey);
        const alreadyPending = await hasActiveMemberProposal(spaceId, personalSpaceId).catch(() => false);
        if (!alreadyPending) {
          requestToBeMember();
        }
      }
    }

    return false;
  }, [personalSpaceId, spaceId, isLoadingSpace, space?.type, membershipRequestStatus, requestToBeMember]);

  const ensureAccess = useCallback(async (): Promise<boolean> => {
    if (!smartAccount || !isRegistered || !personalSpaceId) {
      return false;
    }

    return ensureMembership();
  }, [smartAccount, isRegistered, personalSpaceId, ensureMembership]);

  return { status, promptLogin, ensureAccess, isLoading };
}
