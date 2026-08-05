'use client';

import { Ops } from '@geoprotocol/geo-sdk';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { TransactionWriteFailedError } from '~/core/errors';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { getEntity } from '~/core/io/queries';
import { geo } from '~/core/sdk/geo-client';
import { useReportError } from '~/core/state/status-bar-store';
import { toUserFacingError } from '~/core/utils/error-diagnostics';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { clearLocalMyRankingDraft } from './local-ranking-my-draft';
import { getMyRankingOrderedEntityIds } from './my-ranking-entity';
import { isRollingSubmissionLive, parseTimestampMs } from './ranking-rolling';
import type { RankingSubmissionRecord } from './ranking-submission-types';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';
import { useMyRanking } from './use-my-ranking';
import { useRankingBlockConfig } from './use-ranking-block-config';
import { useRankingBlockRelations } from './use-ranking-block-relations';

const MS_PER_HOUR = 60 * 60 * 1000;

export type RankingSubmissionPublishResult = {
  rankEntityId: string;
  authorSpaceId: string;
  orderedEntityIds: string[];
  authorName: string | null;
  authorAvatarUrl: string | null;
};

function createdAtToEpochMillis(value: string): number {
  return /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) || 0;
}

/** One ballot per author — avoids double-counting duplicate ballots per author. */
export function dedupeSubmissionsByAuthor(submissions: RankingSubmissionRecord[]): RankingSubmissionRecord[] {
  const byAuthor = new Map<string, RankingSubmissionRecord>();
  for (const submission of submissions) {
    const existing = byAuthor.get(submission.authorSpaceId);
    if (!existing || createdAtToEpochMillis(submission.createdAt) >= createdAtToEpochMillis(existing.createdAt)) {
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

  const { isRolling, submissionFrequencyHours } = useRankingBlockConfig({ blockId, spaceId });
  const { aggregatedSubmitterRefs } = useRankingBlockRelations({ blockId, spaceId });

  const submittedAtMs = React.useMemo(
    () => (myRankEntity ? parseTimestampMs(myRankEntity.updatedAt) : 0),
    [myRankEntity]
  );

  const isSubmissionLive = React.useMemo(() => {
    if (!isRolling || !myRankEntity) return true;
    const windowElapsed =
      submissionFrequencyHours != null &&
      submittedAtMs > 0 &&
      Date.now() >= submittedAtMs + submissionFrequencyHours * MS_PER_HOUR;
    if (!windowElapsed) return true;
    return isRollingSubmissionLive({
      personalSpaceId,
      myRankEntityId: myRankEntity.id,
      aggregatedSubmitterRefs,
    });
  }, [aggregatedSubmitterRefs, isRolling, myRankEntity, personalSpaceId, submissionFrequencyHours, submittedAtMs]);

  const hasRolledOff = isRolling && Boolean(myRankEntity) && !isSubmissionLive;

  const mySubmission = hasRolledOff ? null : apiMySubmission;
  const hasMySubmission = (mySubmission?.orderedEntityIds.length ?? 0) > 0;

  const saveMySubmission = React.useCallback(
    async (slots: RankingSubmissionSlot[]): Promise<RankingSubmissionPublishResult | null> => {
      if (!personalSpaceId) return null;
      if (!smartAccount) {
        setToast(React.createElement('span', null, 'Please connect your wallet to publish your ranking'));
        return null;
      }

      const filteredSlots = slots.filter(slot => Boolean(slot.id));
      const votes = filteredSlots.map((slot, index) => ({
        entityId: slot.id,
        spaceId: validateSpaceId(slot.spaceId) ? slot.spaceId : spaceId,
        value: rankingVoteWeightFromIndex(index),
      }));

      if (votes.length === 0) return null;

      const invalidVote = votes.find(vote => !validateEntityId(vote.entityId));
      if (invalidVote) {
        console.error('[useRankingSubmissions] Invalid vote entity id:', invalidVote.entityId);
        reportError(`Failed to publish ranking: invalid entity id "${invalidVote.entityId}"`);
        return null;
      }

      if (myRankEntity && !validateEntityId(myRankEntity.id)) {
        console.error('[useRankingSubmissions] Invalid rank entity id:', myRankEntity.id);
        reportError(`Failed to publish ranking: invalid rank id "${myRankEntity.id}"`);
        return null;
      }

      setIsSaving(true);
      try {
        const rankName = blockName.trim() || 'My ranking';

        const reuseExistingRank = Boolean(myRankEntity) && !hasRolledOff;

        let ops;
        let rankId: string;
        try {
          const result = reuseExistingRank
            ? await geo.ranks.update({
                rankId: myRankEntity!.id,
                rankType: 'WEIGHTED',
                votes,
              })
            : Ops.ranks.create({
                name: rankName,
                rankType: 'WEIGHTED',
                blockId,
                votes,
              });
          ops = result.ops;
          rankId = result.id;
        } catch (error) {
          console.error('[useRankingSubmissions] Building rank ops failed:', error);
          const { message, retry } = toUserFacingError(error, 'Failed to publish ranking: ');
          reportError(message, retry);
          return null;
        }

        const publish = Effect.gen(function* () {
          if (ops.length === 0) {
            throw new Error('No operations to publish');
          }

          const result = yield* Effect.retry(
            Effect.tryPromise({
              try: () =>
                geo.personalSpaces.publishEdit({
                  name: `Ranking: ${rankName}`,
                  spaceId: personalSpaceId,
                  ops,
                  author: personalSpaceId,
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
            return null;
          }
          console.error('[useRankingSubmissions] Publish failed:', err);
          const { message, retry } = toUserFacingError(err, 'Failed to publish ranking: ');
          reportError(message, retry);
          return null;
        }

        clearLocalMyRankingDraft(spaceId, blockId);
        setToast(React.createElement('span', null, 'Ranking published!'));

        // Poll until the indexer reflects the exact order we just submitted, then
        // return so the OG image generates against indexed data. A short upfront
        // settle plus a dense interval detects indexing close to when it lands; the
        // extra polls are light indexed reads. Bounded by an overall time budget.
        const INITIAL_DELAY_MS = 500;
        const POLL_INTERVAL_MS = 750;
        const MAX_POLL_DURATION_MS = 60_000;

        const expectedOrderKey = votes.map(vote => ID.uuidToHex(vote.entityId)).join('|');
        const matchesExpectedOrder = (ids: string[]) => ids.map(id => ID.uuidToHex(id)).join('|') === expectedOrderKey;

        const pollStartedAt = Date.now();
        await new Promise(resolve => setTimeout(resolve, INITIAL_DELAY_MS));
        while (Date.now() - pollStartedAt < MAX_POLL_DURATION_MS) {
          try {
            const rankEntity = await Effect.runPromise(getEntity(rankId, personalSpaceId));
            if (rankEntity && matchesExpectedOrder(getMyRankingOrderedEntityIds(rankEntity, personalSpaceId))) {
              break;
            }
          } catch (e) {
            console.error('[useRankingSubmissions] Poll for indexed ranking order failed:', e);
          }
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        }

        try {
          await refetchMyRanking();
        } catch (e) {
          console.error('[useRankingSubmissions] Refetch after publish failed:', e);
        }
        const authorAvatarUrl =
          profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

        return {
          rankEntityId: rankId,
          authorSpaceId: personalSpaceId,
          orderedEntityIds: votes.map(vote => vote.entityId),
          authorName: profile?.name ?? null,
          authorAvatarUrl,
        };
      } finally {
        setIsSaving(false);
      }
    },
    [
      blockId,
      blockName,
      hasRolledOff,
      myRankEntity,
      personalSpaceId,
      profile?.avatarUrl,
      profile?.name,
      refetchMyRanking,
      reportError,
      setToast,
      smartAccount,
      spaceId,
    ]
  );

  return {
    submissions: [] as RankingSubmissionRecord[],
    mySubmission,
    hasMySubmission,
    saveMySubmission,
    isLoading: isLoadingMyRanking,
    isSaving,
    personalSpaceId,
    isRolling,
    submissionFrequencyHours,
    hasRolledOff,
    isSubmissionLive,
    submittedAtMs,
  };
}
