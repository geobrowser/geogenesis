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
import { validateEntityId } from '~/core/utils/utils';

import { buildRankingVotes, mustMintFreshRank, rankingBallotRules } from './best-debates-ballot';
import {
  type RankingBallotUnreadableError,
  ballotSnapshot,
  blockHasGrades,
  fetchRankBallot,
  isRankingBallotUnreadableError,
} from './fetch-my-ranking-ballot';
import { clearLocalMyRankingDraft } from './local-ranking-my-draft';
import { ballotRecencyKey, pickLatestBallot } from './ranking-ballot-recency';
import { type BallotGrades, NO_GRADES, applyGradeEdits, pruneGrades } from './ranking-grades';
import {
  type OwnRankingPublish,
  RANKING_CHANGED_ELSEWHERE_MESSAGE,
  RANKING_CHANGED_ELSEWHERE_ORDER_MESSAGE,
  RANKING_ALREADY_EMPTY_MESSAGE,
  RANKING_NOTHING_LEFT_TO_PUBLISH_MESSAGE,
  RANKING_OVERTAKEN_MESSAGE,
  RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE,
  type RankingIndexResult,
  classifyReadBack,
  enqueueRankingPublish,
  foldOvertakenPublish,
  getOwnRankingPublish,
  getRankingBallotMaxItems,
  getUnsavedRankingDraft,
  mergeBallots,
  rankingBallotTooLargeMessage,
  rankingPublishKey,
  rankingPublishTiming,
  rebaseUnsavedDraft,
  recordOwnRankingPublish,
  sameBallot,
  setUnsavedRankingDraft,
  subscribeUnsavedRankingDrafts,
} from './ranking-publish-queue';
import { parseTimestampMs, shouldMintNewRankEntity } from './ranking-rolling';
import type { RankingSubmissionRecord } from './ranking-submission-types';
import type { RankingSubmissionSlot } from './ranking-submission-types';
import {
  type MyRankingBallot,
  fetchMyRankingBallot,
  recordPublishedRank,
  releasePublishedRankPin,
  useMyRanking,
} from './use-my-ranking';
import { useRankingBlockConfig } from './use-ranking-block-config';
import { withVoteGrades } from './vote-grade-ops';

const MS_PER_HOUR = 60 * 60 * 1000;

export type RankingSubmissionPublishResult = {
  rankEntityId: string;
  authorSpaceId: string;
  orderedEntityIds: string[];
  /** The grades published with it (Best debates; empty elsewhere). */
  grades: BallotGrades;
  authorName: string | null;
  authorAvatarUrl: string | null;
  /** Resolves once the index settles past this publish: with the ballot it
   *  read back when that ballot is ours, else null (another device's edit
   *  overtook it, or the poll budget lapsed). OG-image generation reads
   *  indexed data, so callers build the image from the resolved ballot, and
   *  only when there is one; never block navigation on it. Never rejects. */
  indexingSettled: Promise<{ orderedEntityIds: string[] } | null>;
};

/**
 * One ballot per author — avoids double-counting duplicate ballots per author. The latest is
 * picked by the shared rule in `ranking-ballot-recency.ts`; a record carries only its
 * `createdAt`, so a same-second tie falls to the ballot id.
 */
export function dedupeSubmissionsByAuthor(submissions: RankingSubmissionRecord[]): RankingSubmissionRecord[] {
  const byAuthor = new Map<string, RankingSubmissionRecord[]>();
  for (const submission of submissions) {
    const list = byAuthor.get(submission.authorSpaceId);
    if (list) list.push(submission);
    else byAuthor.set(submission.authorSpaceId, [submission]);
  }
  return [...byAuthor.values()].flatMap(list => {
    const latest = pickLatestBallot(list, record => ballotRecencyKey(record.id, record.createdAt, null));
    return latest ? [latest] : [];
  });
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
    grades: apiGrades = NO_GRADES,
    isLoading: isLoadingMyRanking,
    readError: unreadableBallot,
    gradesPendingError,
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

  // A ballot that can't be read blocks publishing only while it is the one a
  // publish would build on: once a rolling window is over, publishing mints a
  // fresh rank instead.
  const isRolledOffUnreadable = React.useCallback(
    (error: RankingBallotUnreadableError) =>
      isRolling &&
      !isBallotLive(
        { createdAt: error.rankCreatedAt ?? undefined } as Entity,
        isRolling,
        submissionFrequencyHours,
        Date.now()
      ),
    [isRolling, submissionFrequencyHours]
  );
  const ballotReadError =
    (unreadableBallot && !isRolledOffUnreadable(unreadableBallot) ? unreadableBallot.message : null) ??
    gradesPendingError?.message ??
    null;

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
        /** The grades of that ballot (Best debates). Defaults with it. A slot's
         *  `grade` changes its entry's grade; a slot without one keeps it. */
        basedOnGrades?: BallotGrades;
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
      // An empty list is the ranker clearing their ranking (Preston, 12 Nov): the edit deletes every
      // vote on their Rank and adds none. The Rank and its block link stay.
      const clearing = filteredSlots.length === 0;
      // Best debates (GEO-3678): ORDINAL, and every item keeps its own space, with no fallback to the
      // block's. Every other block publishes exactly as before. See `best-debates-ballot.ts`.
      const ballotRules = rankingBallotRules(blockId, spaceId);

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
      // Grades (GEO-3729) live on the Best debates block only; everywhere else every grade read
      // and written below is empty, and publishing is exactly as before.
      const hasGrades = ballotRules.rankType === 'ORDINAL' && blockHasGrades(blockId);
      // Without grades of its own, an edit is based on the grades this hook last read: a caller
      // that doesn't know about grades (Down rank's removal) then keeps every one.
      const basedOnGrades = hasGrades ? (options?.basedOnGrades ?? apiGrades) : NO_GRADES;
      const gradeEdits = new Map(
        hasGrades
          ? filteredSlots.flatMap(slot => (slot.grade === undefined ? [] : [[ID.uuidToHex(slot.id), slot.grade] as const]))
          : []
      );
      const publishKey = rankingPublishKey(personalSpaceId, blockId);

      pendingSavesRef.current += 1;
      setIsSaving(true);
      const operation = observeOperation('ranking', 'ranking', blockId, opportunity, getContext());

      // Runs when every earlier publish of this ballot (from any screen on this
      // page) has finished: one publish at a time, the next waits its turn.
      const publishInTurn = async (): Promise<RankingSubmissionPublishResult | null> => {
        const rankName = blockName.trim() || 'My ranking';
        const op = operation;
        const ourIds = filteredSlots.map(slot => slot.id);
        const basedOn = basedOnOrderedIds;
        const ourGrades = pruneGrades(ourIds, applyGradeEdits(basedOnGrades, gradeEdits));
        const slotSpaceIds = new Map(filteredSlots.map(slot => [ID.uuidToHex(slot.id), slot.spaceId]));

        // An edit re-sends the whole list and replaces the votes the index holds,
        // so it must be built on what the index holds now. Wait for our previous
        // publish to land, then re-read the published ballot.
        const previous = getOwnRankingPublish(publishKey);
        const previousResult = previous ? await previous.indexed : null;

        let published: MyRankingBallot;
        try {
          published = await fetchMyRankingBallot(personalSpaceId, blockId);
        } catch (error) {
          if (isRankingBallotUnreadableError(error) && isRolledOffUnreadable(error)) {
            // The unreadable ballot's window is over, so this publish mints a
            // fresh rank and never builds on it.
            published = { rankEntity: null, orderedEntityIds: [] };
          } else {
            op.failed('unavailable');
            console.error('[useRankingSubmissions] Re-reading the published ranking failed:', error);
            if (isRankingBallotUnreadableError(error)) {
              reportError(error.message);
              return null;
            }
            const { message, retry } = toUserFacingError(error, 'Failed to publish ranking: ');
            reportError(message, retry);
            return null;
          }
        }

        const previousStanding = previous ? classifyReadBack(ballotSnapshot(published), previous) : null;
        if (
          previous &&
          previousResult?.outcome === 'timeout' &&
          Date.now() - previous.publishedAtMs < rankingPublishTiming.ownPublishBlocksForMs &&
          previousStanding === 'pending'
        ) {
          // The index still holds the ballot our previous publish replaced.
          // Building on it would drop that placement (or update a rank the
          // index can't see yet). If it has moved on to anything else, ours or
          // another device's, the merge below handles it.
          op.failed('conflict');
          reportError(RANKING_PREVIOUS_PUBLISH_PENDING_MESSAGE);
          return null;
        }

        // If another device's edit overtook our previous one, either side may
        // be missing from what is published now: ours if theirs landed after it,
        // theirs if ours landed after it. Fold back in whatever is missing (our
        // previous edit, and the other ballot the poll saw) before this edit
        // builds on top, so nothing either device placed is dropped.
        const publishedIds = published.orderedEntityIds;
        const publishedGrades = hasGrades ? (published.grades ?? NO_GRADES) : NO_GRADES;
        const overtaken =
          previous !== null && (previousStanding === 'superseded' || previousResult?.outcome === 'superseded');
        let theirIds = publishedIds;
        let theirGrades = publishedGrades;
        if (previous && previousStanding === 'superseded') {
          const folded = foldOvertakenPublish(previous, theirIds, theirGrades);
          theirIds = folded.ids;
          theirGrades = folded.grades;
        }
        if (previous && previousResult?.outcome === 'superseded' && previousResult.seen) {
          const folded = mergeBallots({
            base: { ids: previous.baseline.orderedEntityIds, grades: previous.baseline.grades },
            ours: { ids: theirIds, grades: theirGrades },
            theirs: { ids: previousResult.seen, grades: previousResult.seenGrades },
          });
          theirIds = folded.ids;
          theirGrades = folded.grades;
        }

        // Merge onto the published ballot when it moved since the caller read
        // it: our own earlier placement (silent) or another device (we say so).
        // A regrade elsewhere is a move too (GEO-3729).
        const movedSinceRead = !sameBallot(theirIds, theirGrades, basedOn, basedOnGrades);
        const merge = movedSinceRead
          ? mergeBallots({
              base: { ids: basedOn, grades: basedOnGrades },
              ours: { ids: ourIds, grades: ourGrades },
              theirs: { ids: theirIds, grades: theirGrades },
            })
          : { ids: ourIds, grades: ourGrades, overrodeTheirOrder: false };
        const mergedIds = merge.ids;
        const mergedGrades = pruneGrades(mergedIds, merge.grades);
        const changedElsewhere =
          overtaken ||
          (movedSinceRead &&
            !(previous && sameBallot(publishedIds, publishedGrades, previous.orderedEntityIds, previous.grades)));

        if (mergedIds.length === 0 && !clearing) {
          // Every item this edit kept was removed elsewhere, and vice versa.
          // Nothing to publish; show the ranker what is published now.
          op.failed('conflict');
          reportError(RANKING_NOTHING_LEFT_TO_PUBLISH_MESSAGE);
          void refetchMyRanking().catch(e => {
            console.error('[useRankingSubmissions] Refetch after an empty merge failed:', e);
          });
          return null;
        }
        if (mergedIds.length > maxItems) {
          op.failed('invalid_input');
          reportError(rankingBallotTooLargeMessage(mergedIds.length, maxItems));
          return null;
        }

        // The merged ballot's items keep the space they were placed with (this
        // edit's slot, else the published vote); `buildRankingVotes` applies the
        // block's rules (the block's space as fallback, or Best debates' ORDINAL
        // with own spaces only).
        const votes = buildRankingVotes(
          mergedIds.map(entityId => ({
            id: entityId,
            name: null,
            spaceId:
              slotSpaceIds.get(ID.uuidToHex(entityId)) ??
              publishedVoteSpaceId(published, entityId, personalSpaceId) ??
              undefined,
          })),
          ballotRules,
          spaceId
        );
        if (votes.length === 0 && mergedIds.length > 0) {
          op.failed('invalid_input');
          reportError(RANKING_NOTHING_LEFT_TO_PUBLISH_MESSAGE);
          return null;
        }

        const rankEntity = published.rankEntity;
        if (rankEntity && !validateEntityId(rankEntity.id)) {
          op.failed('invalid_input');
          console.error('[useRankingSubmissions] Invalid rank entity id:', rankEntity.id);
          reportError(`Failed to publish ranking: invalid rank id "${rankEntity.id}"`);
          return null;
        }

        const reuseRankForPeriod = !shouldMintNewRankEntity({
          isRolling,
          hasExistingBallot: Boolean(rankEntity),
          isSubmissionLive: isBallotLive(rankEntity, isRolling, submissionFrequencyHours, Date.now()),
        });
        // Best debates: an existing Rank the indexer holds as another type can't take ORDINAL votes,
        // so a fresh ORDINAL Rank supersedes it (GEO-3678, `mustMintFreshRank`).
        const reuseExistingRank = reuseRankForPeriod && !mustMintFreshRank(rankEntity, ballotRules);

        if (mergedIds.length === 0 && !reuseExistingRank) {
          // Nothing live to clear: no Rank for this period (or one a fresh Rank would supersede), so
          // the ranking is already empty here. A Rank with no votes is never minted.
          op.failed('invalid_input');
          reportError(RANKING_ALREADY_EMPTY_MESSAGE);
          void refetchMyRanking().catch(e => {
            console.error('[useRankingSubmissions] Refetch after an empty clear failed:', e);
          });
          return null;
        }

        let ops;
        let rankId: string;
        try {
          const result = reuseExistingRank
            ? await geo.ranks.update({
                rankId: rankEntity!.id,
                rankType: ballotRules.rankType,
                votes,
              })
            : Ops.ranks.create({
                name: rankName,
                rankType: ballotRules.rankType,
                blockId,
                votes,
              });
          // Every vote is re-created, so every grade is written again (GEO-3729).
          ops = hasGrades ? withVoteGrades(result.ops, result.voteIds, votes, mergedGrades) : result.ops;
          rankId = result.id;
        } catch (error) {
          op.failed('invalid_input');
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
          op.failed(classifyOperationFailure(err));
          if (err instanceof Error && err.message.includes('User rejected')) {
            return null;
          }
          console.error('[useRankingSubmissions] Publish failed:', err);
          const { message, retry } = toUserFacingError(err, 'Failed to publish ranking: ');
          reportError(message, retry);
          return null;
        }

        const publishedEntityIds = votes.map(vote => vote.entityId);
        const publishedEntityGrades = pruneGrades(publishedEntityIds, mergedGrades);
        const outcomeProperties = {
          ranking_id: blockId,
          rank_id: rankId,
          mutation_kind: reuseExistingRank ? 'revision' : rankEntity ? 'new_period' : 'first_submission',
          user_operation_hash: result.right,
          item_count: votes.length,
        };
        op.outcome('ranking_submitted', 'submitted', outcomeProperties);
        clearLocalMyRankingDraft(spaceId, blockId);
        // Anything handed back to the ranker is folded into this edit.
        setUnsavedRankingDraft(publishKey, null);
        setToast(
          React.createElement(
            'span',
            null,
            votes.length === 0
              ? 'Ranking cleared.'
              : !changedElsewhere
              ? 'Ranking published!'
              : `Ranking published. ${
                  merge.overrodeTheirOrder ? RANKING_CHANGED_ELSEWHERE_ORDER_MESSAGE : RANKING_CHANGED_ELSEWHERE_MESSAGE
                }`
          )
        );

        // The published ballot is fully known client-side, so surface it now:
        // pin it for useMyRanking and nudge the query. The Share button and My
        // ranking views flip immediately instead of waiting out the indexer.
        const publishedSnapshot = ballotSnapshot(published);
        const baseline = {
          rankId: publishedSnapshot.rankId,
          orderedEntityIds: publishedIds,
          grades: publishedGrades,
          updatedAtMs: publishedSnapshot.updatedAtMs,
          createdAtMs: publishedSnapshot.createdAtMs,
        };
        const ownPublish = { rankId, orderedEntityIds: publishedEntityIds, grades: publishedEntityGrades, baseline };
        recordPublishedRank(personalSpaceId, blockId, rankId, publishedEntityIds, baseline, publishedEntityGrades);
        void refetchMyRanking().catch(e => {
          console.error('[useRankingSubmissions] Refetch after pinning published rank failed:', e);
        });

        // Polls the index until it settles past this publish: it reads back
        // exactly this ballot (`ours`) or moves on to another device's
        // (`superseded`), bounded by a time budget (`timeout`). The next publish
        // of this ballot waits on it; OG images, which render from indexed data,
        // chain on `indexingSettled`. Never rejects.
        //
        // An edit to an existing rank polls that rank alone (one paged entity
        // read). A just-created rank first has to surface in the block listing,
        // which is heavier, so that poll backs off.
        const indexed = (async (): Promise<RankingIndexResult> => {
          const timing = rankingPublishTiming;
          const pollStartedAt = Date.now();
          let listingInterval = timing.listingPollIntervalMs;
          await new Promise(resolve => setTimeout(resolve, timing.initialDelayMs));
          while (Date.now() - pollStartedAt < timing.maxPollMs) {
            let interval = timing.pollIntervalMs;
            try {
              const readBack = reuseExistingRank
                ? await fetchRankBallot(rankId, personalSpaceId, { withGrades: hasGrades })
                : await fetchMyRankingBallot(personalSpaceId, blockId);
              // A rank that can't be read yet is still pending.
              const standing = readBack ? classifyReadBack(ballotSnapshot(readBack), ownPublish) : 'pending';
              if (readBack && standing !== 'pending') {
                return { outcome: standing, seen: readBack.orderedEntityIds, seenGrades: readBack.grades };
              }
              if (!reuseExistingRank) {
                interval = listingInterval;
                listingInterval = Math.min(listingInterval * 1.5, timing.listingPollMaxIntervalMs);
              }
            } catch (e) {
              console.error('[useRankingSubmissions] Poll for indexed ranking order failed:', e);
            }
            await new Promise(resolve => setTimeout(resolve, interval));
          }
          return { outcome: 'timeout', seen: null };
        })();
        const ownRecord: OwnRankingPublish = { ...ownPublish, publishedAtMs: Date.now(), indexed };
        recordOwnRankingPublish(publishKey, ownRecord);

        const indexingSettled = indexed.then(async ({ outcome, seen, seenGrades }) => {
          if (outcome === 'ours') op.outcome('ranking_submitted', 'indexed', outcomeProperties);
          if (outcome !== 'timeout') releasePublishedRankPin(personalSpaceId, blockId, rankId);
          if (outcome === 'superseded' && seen && getOwnRankingPublish(publishKey) === ownRecord) {
            // Another device's edit overtook this one before the index read it
            // back, so one of the two may be lost. Publish nothing on the
            // ranker's behalf: hand both back as unpublished changes (this edit
            // folded onto the ballot the poll saw) and tell them. A newer edit
            // of ours, if one follows, folds it in itself and clears this.
            const folded = foldOvertakenPublish(ownRecord, seen, seenGrades);
            setUnsavedRankingDraft(publishKey, {
              orderedEntityIds: folded.ids,
              grades: folded.grades,
              baseOrderedIds: seen,
              baseGrades: seenGrades,
              overtakenOrderedIds: ownRecord.orderedEntityIds,
              overtakenGrades: ownRecord.grades,
            });
            reportError(RANKING_OVERTAKEN_MESSAGE);
          }
          try {
            await refetchMyRanking();
          } catch (e) {
            console.error('[useRankingSubmissions] Refetch after publish failed:', e);
          }
          // The share image renders from indexed data, so it is built only
          // from a ballot the index read back as ours.
          return outcome === 'ours' && seen ? { orderedEntityIds: seen } : null;
        });

        const authorAvatarUrl =
          profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

        return {
          rankEntityId: rankId,
          authorSpaceId: personalSpaceId,
          orderedEntityIds: publishedEntityIds,
          grades: publishedEntityGrades,
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
      apiGrades,
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
      isRolledOffUnreadable,
    ]
  );

  // Changes of ours handed back unpublished after another device's edit
  // overtook them (see `indexingSettled`). Shared by every screen on the page.
  const draftKey = personalSpaceId ? rankingPublishKey(personalSpaceId, blockId) : null;
  const unsavedDraft = React.useSyncExternalStore(
    subscribeUnsavedRankingDrafts,
    () => (draftKey ? getUnsavedRankingDraft(draftKey) : null),
    () => null
  );

  // Keep the draft current with what is published: re-merge it when the
  // published order changes (another tab or device), and drop it once the
  // published ballot holds all of it. Every hook instance runs this; it is
  // idempotent, so the first to see a change wins and the rest no-op.
  const publishedOrderKey = `${apiRankingEntityIds.join('|')}#${[...apiGrades].join('|')}`;
  React.useEffect(() => {
    if (!draftKey || !unsavedDraft || isLoadingMyRanking || unreadableBallot) return;
    const rebased = rebaseUnsavedDraft(unsavedDraft, apiRankingEntityIds, apiGrades);
    if (rebased !== unsavedDraft) setUnsavedRankingDraft(draftKey, rebased);
    // `publishedOrderKey` stands in for `apiRankingEntityIds`, rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, unsavedDraft, publishedOrderKey, isLoadingMyRanking, unreadableBallot]);

  return {
    submissions: [] as RankingSubmissionRecord[],
    mySubmission,
    myLastSubmission,
    /** Best debates: the grades of the ballot this hook last read (GEO-3729). Empty elsewhere. */
    myGrades: apiGrades,
    hasMySubmission,
    saveMySubmission,
    isLoading: isLoadingMyRanking,
    /** The ranker's ballot exists but couldn't be read whole: show this instead
     *  of treating them as having no ballot, and don't publish over it. */
    ballotReadError,
    retryBallotRead: refetchMyRanking,
    /** Unpublished changes handed back after another device's edit overtook
     *  ours, kept current with the published ballot. Screens show
     *  `orderedEntityIds` as the ranker's draft and publish an edit of it with
     *  `basedOnOrderedIds: orderedEntityIds` (the draft as handed back). */
    unsavedDraft,
    isSaving,
    personalSpaceId,
    isRolling,
    submissionFrequencyHours,
    hasRolledOff,
    isSubmissionLive,
    submittedAtMs,
  };
}
