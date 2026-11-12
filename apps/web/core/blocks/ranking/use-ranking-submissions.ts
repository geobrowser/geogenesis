'use client';

import { Ops } from '@geoprotocol/geo-sdk';
import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { Duration, Effect, Either, Schedule } from 'effect';

import { useActionContext } from '~/core/action-context-provider';
import { type OperationContext, classifyOperationFailure, observeOperation } from '~/core/analytics-operations';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { TransactionWriteFailedError } from '~/core/errors';
import { readCachedPersonalSpace, readCachedSmartAccount } from '~/core/hooks/cached-write-identity';
import { useGeoProfile } from '~/core/hooks/use-geo-profile';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useToast } from '~/core/hooks/use-toast';
import { ID } from '~/core/id';
import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';
import { geo } from '~/core/sdk/geo-client';
import { useReportError } from '~/core/state/status-bar-store';
import type { Entity } from '~/core/types';
import { toUserFacingError } from '~/core/utils/error-diagnostics';
import { validateEntityId, validateSpaceId } from '~/core/utils/utils';

import { clearLocalMyRankingDraft } from './local-ranking-my-draft';
import {
  OWN_PUBLISH_BLOCKS_FOR_MS,
  RANKING_CHANGED_ELSEWHERE_MESSAGE,
  RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE,
  enqueueRankingPublish,
  getOwnRankingPublish,
  getRankingBallotMaxItems,
  mergeBallotOrders,
  rankingBallotTooLargeMessage,
  rankingPublishKey,
  rankingPublishTiming,
  recordOwnRankingPublish,
  sameBallotOrder,
} from './ranking-publish-queue';
import { parseTimestampMs, shouldMintNewRankEntity } from './ranking-rolling';
import type { RankingSubmissionRecord } from './ranking-submission-types';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import { rankingVoteWeightFromIndex } from './ranking-vote-weights';
import {
  type MyRankingBallot,
  fetchMyRankingBallot,
  recordPublishedRank,
  releasePublishedRankPin,
  useMyRanking,
} from './use-my-ranking';
import { useRankingBlockConfig } from './use-ranking-block-config';

const MS_PER_HOUR = 60 * 60 * 1000;

export type RankingSubmissionPublishResult = {
  rankEntityId: string;
  authorSpaceId: string;
  orderedEntityIds: string[];
  authorName: string | null;
  authorAvatarUrl: string | null;
  /** Resolves once the indexer reflects the published order (or the poll budget
   *  lapses). OG-image generation reads indexed data, so callers should chain it
   *  on this — but never block navigation on it. Never rejects. */
  indexingSettled: Promise<void>;
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

/**
 * Whether a ballot is still inside its submission window. Purely clock-based:
 * the window runs from the rank entity's creation time, mirroring the indexer's
 * `submitted_at` (frozen at the edit that created the entity). `updatedAt` is
 * only a fallback for older entities indexed without a `createdAt`.
 */
function isBallotLive(
  rankEntity: Entity | null,
  isRolling: boolean,
  submissionFrequencyHours: number | null | undefined,
  nowMs: number
): boolean {
  if (!isRolling || !rankEntity) return true;
  const submittedAtMs = parseTimestampMs(rankEntity.createdAt ?? rankEntity.updatedAt);
  if (submissionFrequencyHours == null || submittedAtMs === 0) return true;
  return nowMs < submittedAtMs + submissionFrequencyHours * MS_PER_HOUR;
}

/** The space perspective an item was voted under in the published ballot, for
 *  items a merge brings in from it. */
function publishedVoteSpaceId(published: MyRankingBallot, entityId: string, authorSpaceId: string): string | null {
  const rankEntity = published.rankEntity;
  if (!rankEntity) return null;
  const relation = rankEntity.relations.find(
    r =>
      !r.isDeleted &&
      ID.equals(r.spaceId, authorSpaceId) &&
      ID.equals(r.fromEntity.id, rankEntity.id) &&
      ID.equals(r.type.id, RANK_VOTES_RELATION_TYPE_ID) &&
      ID.equals(r.toEntity.id, entityId)
  );
  return relation?.toSpaceId ?? null;
}

export function useRankingSubmissions(blockId: string, spaceId: string, blockName: string) {
  const getContext = useActionContext('ranking_composer', 'ranking', blockId);
  const { personalSpaceId } = usePersonalSpaceId();
  const { smartAccount } = useSmartAccount();
  const walletAddress = smartAccount?.account.address;
  const queryClient = useQueryClient();
  const { profile } = useGeoProfile(walletAddress);
  const [, setToast] = useToast();
  const reportError = useReportError();

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

  // The submission clock runs from the rank entity's creation time, mirroring
  // the indexer's `submitted_at` (frozen at the edit that created the entity).
  // `updatedAt` is only a fallback for older entities indexed without a
  // `createdAt` — it drifts later whenever the ballot is edited.
  const submittedAtMs = React.useMemo(
    () => (myRankEntity ? parseTimestampMs(myRankEntity.createdAt ?? myRankEntity.updatedAt) : 0),
    [myRankEntity]
  );

  // Purely clock-based: the ballot is live until the block's submission window
  // has elapsed since it was created.
  //
  // The block's `Aggregated rankings` relations cannot answer this. They hold one
  // relation per *contributing author*, not every past ballot — the indexer
  // rewrites them from the ballots that fed the current projection each sweep. A
  // block with 56 submissions from 5 people carries 5. (An earlier comment here
  // claimed they "retain every past ballot indefinitely"; they do not. GEO-2871.)
  //
  // Note this clock is the client's alone. Since gaia#921 (GEO-2869) the indexer
  // does not expire ballots at all — an old one is weighted down, never dropped —
  // so "rolled off" now means only "time to rank again", never "your ranking
  // stopped counting".
  const isSubmissionLive = React.useMemo(
    () => isBallotLive(myRankEntity, isRolling, submissionFrequencyHours, Date.now()),
    [isRolling, myRankEntity, submissionFrequencyHours]
  );

  const hasRolledOff = isRolling && Boolean(myRankEntity) && !isSubmissionLive;

  // A rolled-off ballot reads as absent to the block's views and to the call to action, so the
  // author is prompted to rank again. `hasRolledOff` still drives that prompt, and publishing
  // still mints a fresh rank entity below (keyed off myRankEntity, not mySubmission).
  //
  // It is *not* absent to the compose screen any more — see `myLastSubmission` below. That
  // split is the GEO-2871 fix, and this comment is where the reason lives.
  //
  // **The justification that used to sit here was false.** It said the #2122 failure —
  // rebuilding a short ballot from scratch permanently superseding a fuller one — was fixed
  // because "the indexer now retains every ballot in the aggregate, so a fresh submission adds
  // to it instead of replacing". It does not. `ranking-indexer/src/dedup.rs` keeps only the
  // most-recently-updated submission per (block, personal space), by design: one vote per
  // person. Verified on live data — 9 in-window ballots from 5 people produced exactly 5
  // aggregated rankings.
  //
  // So #2122 was still live: blank the sheet, rank 3 things, and the 20 you ranked before were
  // gone from your contribution. The reason it could not be fixed by simply un-blanking here is
  // that the blanking is what *produces* the prompt — `showEditRankingButton` clears **because**
  // `mySubmission` goes null (see `ranking-block-body.tsx`). Hence the second value rather than
  // a change to this one: the prompt keeps its cause, and the ballot survives.
  const mySubmission = hasRolledOff ? null : apiMySubmission;
  const hasMySubmission = (mySubmission?.orderedEntityIds.length ?? 0) > 0;

  // The same ballot, *not* blanked on roll-off — what the author last ranked, which the
  // indexer is still counting (see the note above about `dedup_latest`).
  //
  // The compose screen seeds from this rather than `mySubmission`, so re-ranking starts from
  // "here is what you said, change what you want" instead of an empty sheet. That is the
  // GEO-2871 fix and it is deliberately narrow: `mySubmission` keeps blanking, so the "Add my
  // ranking" call to action still appears and the prompt to re-rank survives. Fixing the loss
  // by un-blanking `mySubmission` outright would have taken the prompt with it.
  //
  // It also leaves `hasUnpublishedChanges` reading true against an empty published key, which
  // is correct on roll-off: publishing has to mint a fresh rank entity to get a fresh
  // `submitted_at`, and `shouldMintNewRankEntity` already does.
  const myLastSubmission = apiMySubmission;

  // Counts this hook's publishes that are queued or in flight, so `isSaving`
  // stays true until the last one finishes.
  const pendingSavesRef = React.useRef(0);

  const saveMySubmission = React.useCallback(
    async (
      slots: RankingSubmissionSlot[],
      opportunity?: OperationContext,
      options?: {
        /** The published order the caller built `slots` from. Defaults to the
         *  ballot this hook last read, which is what the screens edit. */
        basedOnOrderedIds?: string[];
      }
    ): Promise<RankingSubmissionPublishResult | null> => {
      const account = readCachedSmartAccount(queryClient, smartAccount);
      if (!account) {
        setToast(React.createElement('span', null, 'Please connect your wallet to publish your ranking'));
        return null;
      }
      const { personalSpaceId } = readCachedPersonalSpace(queryClient, account.account.address);
      if (!personalSpaceId) return null;

      const filteredSlots = slots.filter(slot => Boolean(slot.id));
      if (filteredSlots.length === 0) return null;

      const invalidSlot = filteredSlots.find(slot => !validateEntityId(slot.id));
      if (invalidSlot) {
        console.error('[useRankingSubmissions] Invalid vote entity id:', invalidSlot.id);
        reportError(`Failed to publish ranking: invalid entity id "${invalidSlot.id}"`);
        return null;
      }

      const maxItems = getRankingBallotMaxItems();
      if (filteredSlots.length > maxItems) {
        reportError(rankingBallotTooLargeMessage(filteredSlots.length, maxItems));
        return null;
      }

      const basedOnOrderedIds = options?.basedOnOrderedIds ?? apiRankingEntityIds;
      const publishKey = rankingPublishKey(personalSpaceId, blockId);

      pendingSavesRef.current += 1;
      setIsSaving(true);
      const operation = observeOperation('ranking', 'ranking', blockId, opportunity, getContext());

      // Runs when every earlier publish of this ballot (from any screen on this
      // page) has finished: one publish at a time, the next waits its turn.
      const publishInTurn = async (): Promise<RankingSubmissionPublishResult | null> => {
        const rankName = blockName.trim() || 'My ranking';

        // An edit re-sends the whole list and replaces the votes the index holds,
        // so it must be built on what the index holds now. Wait for our previous
        // publish to land, then re-read the published ballot.
        const previous = getOwnRankingPublish(publishKey);
        const previousIndexed = previous ? await previous.indexed : true;

        let published: MyRankingBallot;
        try {
          published = await fetchMyRankingBallot(personalSpaceId, blockId);
        } catch (error) {
          operation.failed('unavailable');
          console.error('[useRankingSubmissions] Re-reading the published ranking failed:', error);
          const { message, retry } = toUserFacingError(error, 'Failed to publish ranking: ');
          reportError(message, retry);
          return null;
        }

        if (
          previous &&
          !previousIndexed &&
          Date.now() - previous.publishedAtMs < OWN_PUBLISH_BLOCKS_FOR_MS &&
          !(
            published.rankEntity &&
            ID.equals(published.rankEntity.id, previous.rankId) &&
            sameBallotOrder(published.orderedEntityIds, previous.orderedEntityIds)
          )
        ) {
          // Building on an index that hasn't caught up would drop the previous
          // placement (or update a rank the index can't see yet).
          operation.failed('conflict');
          reportError(RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE);
          return null;
        }

        // Merge onto the published ballot when it moved since the caller read
        // it: our own earlier placement (silent) or another device (we say so).
        const ourIds = filteredSlots.map(slot => slot.id);
        const publishedIds = published.orderedEntityIds;
        const movedSinceRead = !sameBallotOrder(publishedIds, basedOnOrderedIds);
        const mergedIds = movedSinceRead
          ? mergeBallotOrders({ base: basedOnOrderedIds, ours: ourIds, theirs: publishedIds })
          : ourIds;
        const changedElsewhere =
          movedSinceRead && !(previous && sameBallotOrder(publishedIds, previous.orderedEntityIds));

        if (mergedIds.length === 0) {
          operation.failed('conflict');
          reportError(RANKING_CHANGED_ELSEWHERE_MESSAGE);
          return null;
        }
        if (mergedIds.length > maxItems) {
          operation.failed('invalid_input');
          reportError(rankingBallotTooLargeMessage(mergedIds.length, maxItems));
          return null;
        }

        const slotSpaceIds = new Map(filteredSlots.map(slot => [ID.uuidToHex(slot.id), slot.spaceId]));
        const votes = mergedIds.map((entityId, index) => {
          const slotSpaceId =
            slotSpaceIds.get(ID.uuidToHex(entityId)) ?? publishedVoteSpaceId(published, entityId, personalSpaceId);
          return {
            entityId,
            spaceId: slotSpaceId && validateSpaceId(slotSpaceId) ? slotSpaceId : spaceId,
            value: rankingVoteWeightFromIndex(index),
          };
        });

        const rankEntity = published.rankEntity;
        if (rankEntity && !validateEntityId(rankEntity.id)) {
          console.error('[useRankingSubmissions] Invalid rank entity id:', rankEntity.id);
          reportError(`Failed to publish ranking: invalid rank id "${rankEntity.id}"`);
          return null;
        }

        const reuseExistingRank = !shouldMintNewRankEntity({
          isRolling,
          hasExistingBallot: Boolean(rankEntity),
          isSubmissionLive: isBallotLive(rankEntity, isRolling, submissionFrequencyHours, Date.now()),
        });

        let ops;
        let rankId: string;
        try {
          const result = reuseExistingRank
            ? await geo.ranks.update({
                rankId: rankEntity!.id,
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
          operation.failed('invalid_input');
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

          // Safe submission retries belong to the wallet. An uncertain response
          // must not cause another ranking write here.
          const txHash = yield* Effect.tryPromise({
            try: () =>
              account.sendUserOperation({
                calls: [{ to: result.to, value: 0n, data: result.calldata }],
              }),
            catch: error => new TransactionWriteFailedError('Transaction failed', { cause: error }),
          });

          return txHash;
        });

        const result = await Effect.runPromise(Effect.either(publish));

        if (Either.isLeft(result)) {
          const err = result.left;
          operation.failed(classifyOperationFailure(err));
          if (err instanceof Error && err.message.includes('User rejected')) {
            return null;
          }
          console.error('[useRankingSubmissions] Publish failed:', err);
          const { message, retry } = toUserFacingError(err, 'Failed to publish ranking: ');
          reportError(message, retry);
          return null;
        }

        const publishedEntityIds = votes.map(vote => vote.entityId);
        const outcomeProperties = {
          ranking_id: blockId,
          rank_id: rankId,
          mutation_kind: reuseExistingRank ? 'revision' : rankEntity ? 'new_period' : 'first_submission',
          user_operation_hash: result.right,
          item_count: votes.length,
        };
        operation.outcome('ranking_submitted', 'submitted', outcomeProperties);
        clearLocalMyRankingDraft(spaceId, blockId);
        setToast(
          React.createElement(
            'span',
            null,
            changedElsewhere ? `Ranking published. ${RANKING_CHANGED_ELSEWHERE_MESSAGE}` : 'Ranking published!'
          )
        );

        // The published ballot is fully known client-side, so surface it now:
        // pin it for useMyRanking and nudge the query. The Share button and My
        // ranking views flip immediately instead of waiting out the indexer.
        recordPublishedRank(personalSpaceId, blockId, rankId, publishedEntityIds);
        void refetchMyRanking().catch(e => {
          console.error('[useRankingSubmissions] Refetch after pinning published rank failed:', e);
        });

        // Polls the same read the next publish starts from until it returns
        // exactly this ballot (bounded by a time budget). The next publish of
        // this ballot waits on it; OG images, which render from indexed data,
        // chain on `indexingSettled`. Never rejects.
        const indexed = (async () => {
          const { initialDelayMs, pollIntervalMs, maxPollMs } = rankingPublishTiming;
          const pollStartedAt = Date.now();
          await new Promise(resolve => setTimeout(resolve, initialDelayMs));
          while (Date.now() - pollStartedAt < maxPollMs) {
            try {
              const readBack = await fetchMyRankingBallot(personalSpaceId, blockId);
              if (
                readBack.rankEntity &&
                ID.equals(readBack.rankEntity.id, rankId) &&
                sameBallotOrder(readBack.orderedEntityIds, publishedEntityIds)
              ) {
                return true;
              }
            } catch (e) {
              console.error('[useRankingSubmissions] Poll for indexed ranking order failed:', e);
            }
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
          }
          return false;
        })();
        recordOwnRankingPublish(publishKey, {
          rankId,
          orderedEntityIds: publishedEntityIds,
          publishedAtMs: Date.now(),
          indexed,
        });

        const indexingSettled = indexed.then(async isIndexed => {
          if (isIndexed) {
            operation.outcome('ranking_submitted', 'indexed', outcomeProperties);
            releasePublishedRankPin(personalSpaceId, blockId, rankId, publishedEntityIds);
          }
          try {
            await refetchMyRanking();
          } catch (e) {
            console.error('[useRankingSubmissions] Refetch after publish failed:', e);
          }
        });

        const authorAvatarUrl =
          profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

        return {
          rankEntityId: rankId,
          authorSpaceId: personalSpaceId,
          orderedEntityIds: publishedEntityIds,
          authorName: profile?.name ?? null,
          authorAvatarUrl,
          indexingSettled,
        };
      };

      try {
        return await enqueueRankingPublish(publishKey, publishInTurn);
      } catch (error) {
        operation.failed(classifyOperationFailure(error));
        console.error('[useRankingSubmissions] Publish failed:', error);
        const { message, retry } = toUserFacingError(error, 'Failed to publish ranking: ');
        reportError(message, retry);
        return null;
      } finally {
        pendingSavesRef.current -= 1;
        if (pendingSavesRef.current === 0) setIsSaving(false);
      }
    },
    [
      apiRankingEntityIds,
      getContext,
      blockId,
      blockName,
      isRolling,
      queryClient,
      profile?.avatarUrl,
      profile?.name,
      refetchMyRanking,
      reportError,
      setToast,
      smartAccount,
      spaceId,
      submissionFrequencyHours,
    ]
  );

  return {
    submissions: [] as RankingSubmissionRecord[],
    mySubmission,
    myLastSubmission,
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
