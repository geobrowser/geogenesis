'use client';

import * as React from 'react';

import type { RankingSubmissionSlot } from '~/core/blocks/ranking/ranking-submission-types';
import {
  useBestDebatesBallotPublisher,
  useMyPushedDownDebates,
} from '~/core/blocks/ranking/use-my-pushed-down-debates';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import { useRankingSubmissions } from '~/core/blocks/ranking/use-ranking-submissions';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { normId } from '~/core/utils/norm-id';

import { rankingComposeSeed, useRankingComposeDraft } from '../use-ranking-compose-draft';
import { useBestDebatesCompose } from './use-best-debates-compose';
import { useBestDebatesPushDownSlot } from './use-best-debates-push-down-slot';

const NO_IDS: readonly string[] = [];

/**
 * Ranking from the space page's Best debates block (Preston, 12 Nov): Rank on a row opens the
 * compare flow over the page, and Done publishes the ranker's ballot with that one placement
 * (`publishOnDone`, through the same queue and merge as the ranking screen). Down rank is the
 * ranking screen's: the downvote at once, and a toast with Undo.
 *
 * Off (every read idle, nothing drawn) unless the viewer may rank: the flag and Debates membership.
 */
export function useBestDebatesBlockRanking({
  enabled,
  blockId,
  spaceId,
  isMobile,
}: {
  enabled: boolean;
  blockId: string;
  spaceId: string;
  isMobile: boolean;
}) {
  const { personalSpaceId } = usePersonalSpaceId();
  const { myLastSubmission, saveMySubmission, isSaving, isLoading, ballotReadError, unsavedDraft } =
    useRankingSubmissions(blockId, spaceId, 'Best debates');
  const { orderedIds, setOrderedIds, getBasedOnOrderedIds, markPublished } = useRankingComposeDraft(
    rankingComposeSeed(unsavedDraft, myLastSubmission?.orderedEntityIds)
  );

  const { debates: pushedDown } = useMyPushedDownDebates({ blockId: enabled ? blockId : null });
  const pushedDownEntityIds = React.useMemo(() => pushedDown.map(debate => debate.entityId), [pushedDown]);
  const pushDown = useBestDebatesPushDownSlot({ blockId: enabled ? blockId : null, pushedDownEntityIds });
  const { publish: publishClearingDownvotes, isPublishing } = useBestDebatesBallotPublisher();

  const save = async (slots: RankingSubmissionSlot[]) => {
    const result = await publishClearingDownvotes(
      slots.map(slot => slot.id),
      () => saveMySubmission(slots, undefined, { basedOnOrderedIds: getBasedOnOrderedIds() })
    );
    return result?.published ?? null;
  };

  // The compare view names the debate it shows from your ranking; the block's rows don't hold them.
  const { entries } = useRankingEntryEntities(spaceId, enabled ? orderedIds : []);
  const nameById = React.useMemo(() => new Map(entries.map(entry => [normId(entry.entityId), entry.name])), [entries]);

  const compose = useBestDebatesCompose({
    enabled,
    blockId,
    blockSpaceId: spaceId,
    isMobile,
    orderedIds,
    setOrderedIds,
    hasUnpublishedChanges: false,
    nameOf: entityId => nameById.get(normId(entityId)) ?? null,
    personalSpaceId,
    saveMySubmission: save,
    isSaving: isSaving || isPublishing,
    pushDown: pushDown.slot,
    onPublished: (published, sentIds) => markPublished(published.orderedEntityIds, sentIds),
    // Nothing else on this page can save the placement, so Done publishes it.
    publishOnDone: true,
  });

  const myRankById = React.useMemo(() => new Map(orderedIds.map((id, i) => [normId(id), i + 1])), [orderedIds]);
  // Until the ranker's own ballot is read whole, a placement would compare against the wrong list.
  const ready = enabled && !isLoading && !ballotReadError;

  return {
    enabled,
    ready,
    myRankOf: (entityId: string) => myRankById.get(normId(entityId)) ?? null,
    rank: (entityId: string) => compose.placeFromTeam(entityId),
    downRank: (entityId: string) => compose.requestPushDown(entityId),
    pushedDownEntityIds: enabled ? pushedDownEntityIds : NO_IDS,
    /** "You've ranked N of M debates from the last 7 days", in To rank's terms. */
    coverage: enabled && compose.toRankCoverage ? compose.toRankCoverage : null,
    dialogs: enabled ? (
      <>
        {compose.dialogs}
        {pushDown.binding(compose.activeEntityId)}
      </>
    ) : null,
  };
}
