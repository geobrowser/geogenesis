'use client';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { clearLocalMyRankingDraft } from './local-ranking-my-draft';
import {
  RANKING_LOCAL_SUBMISSION_SAVED_EVENT,
  loadLocalRankingSubmissions,
  saveLocalMyRanking,
} from './local-ranking-submissions';
import type { RankingSubmissionRecord } from './ranking-submission-types';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { useMyRanking } from './use-my-ranking';

/** One ballot per author — avoids double-counting duplicate ballots per author. */
export function dedupeSubmissionsByAuthor(submissions: RankingSubmissionRecord[]): RankingSubmissionRecord[] {
  const byAuthor = new Map<string, RankingSubmissionRecord>();
  for (const submission of submissions) {
    const existing = byAuthor.get(submission.authorSpaceId);
    if (!existing || submission.createdAt >= existing.createdAt) {
      byAuthor.set(submission.authorSpaceId, submission);
    }
  }
  return [...byAuthor.values()];
}

function enrichSubmissionAuthor(
  submission: RankingSubmissionRecord,
  profile: { address?: string; name?: string | null; avatarUrl?: string | null } | null | undefined,
  walletAddress: string | undefined,
  myAvatarUrl: string | null
): RankingSubmissionRecord {
  return {
    ...submission,
    author: {
      ...submission.author,
      address: profile?.address ?? walletAddress ?? submission.author.address,
      name: profile?.name ?? submission.author.name,
      avatarUrl: myAvatarUrl ?? submission.author.avatarUrl,
    },
  };
}

export function useRankingSubmissions(blockId: string, spaceId: string, _blockName: string) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);

  const {
    myRankEntity,
    orderedEntityIds: apiRankingEntityIds,
    isLoading: isLoadingMyRanking,
    refetchMyRanking,
  } = useMyRanking(blockId);

  const [submissions, setSubmissions] = React.useState<RankingSubmissionRecord[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  const reloadLocalSubmissions = React.useCallback(() => {
    setSubmissions(loadLocalRankingSubmissions(spaceId, blockId));
  }, [blockId, spaceId]);

  React.useEffect(() => {
    reloadLocalSubmissions();
    setIsLoadingSubmissions(false);
  }, [reloadLocalSubmissions]);

  React.useEffect(() => {
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ spaceId: string; blockId: string }>).detail;
      if (detail?.spaceId === spaceId && detail?.blockId === blockId) {
        reloadLocalSubmissions();
      }
    };
    const onPageShow = () => reloadLocalSubmissions();

    window.addEventListener(RANKING_LOCAL_SUBMISSION_SAVED_EVENT, onSaved);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener(RANKING_LOCAL_SUBMISSION_SAVED_EVENT, onSaved);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [blockId, reloadLocalSubmissions, spaceId]);

  const uniqueSubmissions = React.useMemo(() => dedupeSubmissionsByAuthor(submissions), [submissions]);

  const localMySubmission = React.useMemo(
    () => (personalSpaceId ? (uniqueSubmissions.find(s => s.authorSpaceId === personalSpaceId) ?? null) : null),
    [personalSpaceId, uniqueSubmissions]
  );

  const apiMySubmission = React.useMemo((): RankingSubmissionRecord | null => {
    if (!personalSpaceId || !myRankEntity) return null;

    const myAvatarUrl = profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

    return {
      id: myRankEntity.id,
      authorSpaceId: personalSpaceId,
      targetBlockId: blockId,
      targetBlockSpaceId: spaceId,
      orderedEntityIds: apiRankingEntityIds,
      createdAt: String(myRankEntity.updatedAt ?? ''),
      author: {
        spaceId: personalSpaceId,
        address: profile?.address ?? walletAddress ?? personalSpaceId,
        name: profile?.name ?? null,
        avatarUrl: myAvatarUrl,
      },
    };
  }, [
    apiRankingEntityIds,
    blockId,
    myRankEntity,
    personalSpaceId,
    profile?.address,
    profile?.avatarUrl,
    profile?.name,
    spaceId,
    walletAddress,
  ]);

  const mySubmission = React.useMemo((): RankingSubmissionRecord | null => {
    const myAvatarUrl = profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

    if (localMySubmission) {
      return enrichSubmissionAuthor(localMySubmission, profile, walletAddress, myAvatarUrl);
    }

    return apiMySubmission;
  }, [apiMySubmission, localMySubmission, profile, walletAddress]);

  const hasMySubmission = (mySubmission?.orderedEntityIds.length ?? 0) > 0;

  const saveMySubmission = React.useCallback(
    async (slots: RankingSubmissionSlot[]) => {
      if (!personalSpaceId) return;

      setIsSaving(true);
      try {
        const myAvatarUrl =
          profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

        const record = saveLocalMyRanking({
          spaceId,
          blockId,
          personalSpaceId,
          slots,
          author: {
            spaceId: personalSpaceId,
            address: profile?.address ?? walletAddress ?? personalSpaceId,
            name: profile?.name ?? null,
            avatarUrl: myAvatarUrl,
          },
        });

        clearLocalMyRankingDraft(spaceId, blockId);

        // TODO(ranking-api): createRank(blockId, slots) or updateRank(existingRankId, slots)
        setSubmissions(prev => {
          const without = prev.filter(s => s.authorSpaceId !== personalSpaceId);
          return [...without, record];
        });
        await refetchMyRanking();
      } finally {
        setIsSaving(false);
      }
    },
    [blockId, personalSpaceId, profile, refetchMyRanking, spaceId, walletAddress]
  );

  return {
    submissions: uniqueSubmissions,
    mySubmission,
    hasMySubmission,
    saveMySubmission,
    isLoading: isLoadingSubmissions || isLoadingMyRanking,
    isSaving,
    personalSpaceId,
  };
}
