'use client';

import { personalSpace } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { TransactionWriteFailedError } from '~/core/errors';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { checkEntityExists } from '~/core/io/queries';
import { useReportError } from '~/core/state/status-bar-store';
import { describeError } from '~/core/utils/error-diagnostics';

import { clearLocalMyRankingDraft } from './local-ranking-my-draft';
import { createRank, getExistingVoteRelations, updateRank } from './ranking-rank-api';
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

function retrySchedule(label: string, maxDuration: Duration.DurationInput) {
  return Schedule.exponential('100 millis').pipe(
    Schedule.jittered,
    Schedule.compose(Schedule.elapsed),
    Schedule.whileOutput(Duration.lessThanOrEqualTo(Duration.decode(maxDuration)))
  );
}

export function useRankingSubmissions(blockId: string, spaceId: string, blockName: string) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const { profile } = useGeoProfile(walletAddress);
  const [, setToast] = useToast();
  const reportError = useReportError();

  const publishQueueRef = React.useRef<Promise<unknown>>(Promise.resolve());

  const {
    myRankEntity,
    orderedEntityIds: apiRankingEntityIds,
    isLoading: isLoadingMyRanking,
    refetchMyRanking,
  } = useMyRanking(blockId);

  const [isSaving, setIsSaving] = React.useState(false);

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

  const mySubmission = apiMySubmission;
  const hasMySubmission = (mySubmission?.orderedEntityIds.length ?? 0) > 0;

  const saveMySubmission = React.useCallback(
    async (slots: RankingSubmissionSlot[]) => {
      if (!personalSpaceId) return;
      if (!smartAccount) {
        setToast(React.createElement('span', null, 'Please connect your wallet to publish your ranking'));
        return;
      }

      const votes = slots
        .filter(slot => Boolean(slot.id))
        .map(slot => ({
          entityId: slot.id,
          spaceId: slot.spaceId ?? spaceId,
        }));

      if (votes.length === 0) return;

      setIsSaving(true);
      try {
        const rankName = blockName.trim() || 'My ranking';
        const existingVotes = myRankEntity ? getExistingVoteRelations(myRankEntity) : [];

        const { ops, id: rankId } = myRankEntity
          ? updateRank({
              rankId: myRankEntity.id,
              votes,
              existingVotes,
            })
          : createRank({
              name: rankName,
              rankType: 'ORDINAL',
              blockId,
              votes,
            });

        const publish = Effect.gen(function* () {
          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                personalSpace.publishEdit({
                  name: `Ranking: ${rankName}`,
                  spaceId: personalSpaceId,
                  ops,
                  author: personalSpaceId,
                  network: 'TESTNET',
                }),
              catch: error => new TransactionWriteFailedError('IPFS upload failed', { cause: error }),
            }),
            retrySchedule('publishEdit', Duration.minutes(1))
          );

          const txHash = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                smartAccount.sendUserOperation({
                  calls: [{ to: result.to, value: 0n, data: result.calldata }],
                }),
              catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
            }),
            retrySchedule('sendUserOperation', Duration.seconds(10))
          );

          return txHash;
        });

        const previousPublish = publishQueueRef.current;
        const thisPublish = previousPublish
          .catch(() => undefined)
          .then(() => Effect.runPromise(Effect.either(publish)));
        publishQueueRef.current = thisPublish.catch(() => undefined);
        const result = await thisPublish;

        if (Either.isLeft(result)) {
          const err = result.left;
          if (err instanceof Error && err.message.includes('User rejected')) {
            return;
          }
          console.error('[useRankingSubmissions] Publish failed:', err);
          reportError(`Failed to publish ranking: ${describeError(err)}`);
          return;
        }

        clearLocalMyRankingDraft(spaceId, blockId);
        setToast(React.createElement('span', null, 'Ranking published!'));

        const FIRST_POLL_MS = 1500;
        const POLL_INTERVAL_MS = 2000;
        const MAX_POLL_ATTEMPTS = 30;

        await new Promise(resolve => setTimeout(resolve, FIRST_POLL_MS));
        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
          try {
            const exists = await Effect.runPromise(checkEntityExists(rankId));
            if (exists) break;
          } catch (e) {
            console.error('[useRankingSubmissions] Poll for indexed rank failed:', e);
          }
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        await refetchMyRanking();
      } finally {
        setIsSaving(false);
      }
    },
    [blockId, blockName, myRankEntity, personalSpaceId, refetchMyRanking, reportError, setToast, smartAccount, spaceId]
  );

  return {
    submissions: [] as RankingSubmissionRecord[],
    mySubmission,
    hasMySubmission,
    saveMySubmission,
    isLoading: isLoadingMyRanking,
    isSaving,
    personalSpaceId,
  };
}
