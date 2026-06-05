'use client';

import * as React from 'react';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';

import { loadLocalRankingSubmissions, saveLocalMyRanking } from './local-ranking-submissions';
import type { RankingSubmissionRecord } from './ranking-submission-types';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { aggregateLeaderboardFromSubmissions } from './ranking-submissions';

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

export function useRankingSubmissions(blockId: string, spaceId: string, _blockName: string) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);

  const [submissions, setSubmissions] = React.useState<RankingSubmissionRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    // TODO(ranking-api): fetchAggregatedRankings(blockId); my ballot via createRank/updateRank (not fetchIndividualRanking)
    setSubmissions(loadLocalRankingSubmissions(spaceId, blockId));
    setIsLoading(false);
  }, [spaceId, blockId]);

  const uniqueSubmissions = React.useMemo(() => dedupeSubmissionsByAuthor(submissions), [submissions]);

  const mySubmission = React.useMemo(
    () => (personalSpaceId ? uniqueSubmissions.find(s => s.authorSpaceId === personalSpaceId) : null),
    [personalSpaceId, uniqueSubmissions]
  );

  const hasMySubmission = Boolean(mySubmission?.orderedEntityIds.length);
  const participantIds = React.useMemo(() => uniqueSubmissions.map(s => s.authorSpaceId), [uniqueSubmissions]);

  // TODO(ranking-api): Replace client aggregate with fetchAggregatedRankings(blockId)
  const leaderboard = React.useMemo(() => aggregateLeaderboardFromSubmissions(uniqueSubmissions), [uniqueSubmissions]);
  const submissionCount = uniqueSubmissions.length;

  const saveMySubmission = React.useCallback(
    async (slots: RankingSubmissionSlot[]) => {
      if (!personalSpaceId || !walletAddress) return;

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
            address: profile?.address ?? walletAddress,
            name: profile?.name ?? null,
            avatarUrl: myAvatarUrl,
          },
        });

        // TODO(ranking-api): createRank(blockId, slots) or updateRank(existingRankId, slots)
        setSubmissions(prev => {
          const without = prev.filter(s => s.authorSpaceId !== personalSpaceId);
          return [...without, record];
        });
      } finally {
        setIsSaving(false);
      }
    },
    [blockId, personalSpaceId, profile, spaceId, walletAddress]
  );

  const refetch = React.useCallback(async () => {
    setSubmissions(loadLocalRankingSubmissions(spaceId, blockId));
  }, [spaceId, blockId]);

  return {
    submissions: uniqueSubmissions,
    mySubmission,
    hasMySubmission,
    participantIds,
    leaderboard,
    submissionCount,
    saveMySubmission,
    isLoading,
    isSaving,
    personalSpaceId,
    refetch,
  };
}
