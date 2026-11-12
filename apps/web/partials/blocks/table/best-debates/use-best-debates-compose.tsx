'use client';

import * as React from 'react';

import { fetchDebateOwnSpaces } from '~/core/blocks/ranking/best-debates-debates';
import { insertAt } from '~/core/blocks/ranking/ranking-placement';
import type { RankingSubmissionSlot } from '~/core/blocks/ranking/ranking-submission-types';
import {
  type RankersRead,
  refreshRankersAfterIndexing,
  useBestDebatesToRank,
} from '~/core/blocks/ranking/use-best-debates-to-rank';
import { useBlockRankers } from '~/core/blocks/ranking/use-block-rankers';
import { useRankingEntryEntities } from '~/core/blocks/ranking/use-ranking-entry-entities';
import type { RankingSubmissionPublishResult } from '~/core/blocks/ranking/use-ranking-submissions';
import { useToast } from '~/core/hooks/use-toast';
import { normId } from '~/core/utils/norm-id';

import type { RankingComposeTeamMode, RankingComposeTeamView } from '../ranking-compose-global-ranking';
import type { RankingComposeMobileTab, RankingComposeMobileTabs } from '../ranking-compose-layout';
import { BestDebatesToRankList } from './best-debates-to-rank-list';
import type { PushDownSlot } from './rank-choice-dialog';
import { type PlacementOrigin, useBestDebatesPlacement } from './use-best-debates-placement';

export type UseBestDebatesComposeArgs = {
  /** False on every other ranking block: every read is off and nothing here is used. */
  enabled: boolean;
  blockId: string;
  /** The block's space (the Debates space); its members and editors are the rankers. */
  blockSpaceId: string;
  isMobile: boolean;
  orderedIds: string[];
  setOrderedIds: (ids: string[]) => void;
  hasUnpublishedChanges: boolean;
  nameOf: (entityId: string) => string | null;
  personalSpaceId: string | null | undefined;
  saveMySubmission: (slots: RankingSubmissionSlot[]) => Promise<RankingSubmissionPublishResult | null>;
  isSaving: boolean;
  /** Runs after each publish that went out (the screen generates its share images there). */
  onPublished?: (published: RankingSubmissionPublishResult) => void;
  /** GEO-3679 fills this: Push it down in the Rank choice, and the debates to keep out of To rank. */
  pushDown?: PushDownSlot & { pushedDownEntityIds?: readonly string[] };
};

/**
 * Everything the Best debates ranking screen adds to the ranking compose screen (GEO-3678), behind
 * one switch: the team column's All / To rank, placing a debate by comparison, dragging a debate in,
 * the phone tabs, and publishing every change as one ORDINAL ballot whose items keep their own
 * spaces. `RankingComposeScreen` reads it only when the block is the Best debates block.
 */
export function useBestDebatesCompose({
  enabled,
  blockId,
  blockSpaceId,
  isMobile,
  orderedIds,
  setOrderedIds,
  hasUnpublishedChanges,
  nameOf,
  personalSpaceId,
  saveMySubmission,
  isSaving,
  onPublished,
  pushDown,
}: UseBestDebatesComposeArgs) {
  const [, setToast] = useToast();
  const [teamMode, setTeamMode] = React.useState<RankingComposeTeamMode>('all');
  const [mobileTab, setMobileTab] = React.useState<RankingComposeMobileTab>('global');

  const rankers: RankersRead = useBlockRankers({ blockId: enabled ? blockId : null, spaceId: blockSpaceId });

  const excludeFromToRank = React.useMemo(
    () => [...orderedIds, ...(pushDown?.pushedDownEntityIds ?? [])],
    [orderedIds, pushDown?.pushedDownEntityIds]
  );
  const toRank = useBestDebatesToRank({ enabled, excludeEntityIds: excludeFromToRank });
  const toRankIds = React.useMemo(() => toRank.debates.map(debate => debate.entityId), [toRank.debates]);
  const { entries: toRankEntries } = useRankingEntryEntities(blockSpaceId, enabled ? toRankIds : []);
  const toRankEntriesById = React.useMemo(
    () => new Map(toRankEntries.map(entry => [normId(entry.entityId), entry])),
    [toRankEntries]
  );
  const toRankNameById = React.useMemo(
    () => new Map(toRank.debates.map(debate => [normId(debate.entityId), debate.name])),
    [toRank.debates]
  );

  const debateName = React.useCallback(
    (entityId: string) =>
      nameOf(entityId) ??
      toRankEntriesById.get(normId(entityId))?.name ??
      toRankNameById.get(normId(entityId)) ??
      'Untitled debate',
    [nameOf, toRankEntriesById, toRankNameById]
  );

  /**
   * Publishes `ids` as one ballot edit. Each item is filed under the debate's own space (see
   * `best-debates-debates.ts`); a debate whose space can't be found is left out and the ranker told,
   * never filed under the block's space. No vote is cast.
   */
  const publish = React.useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!personalSpaceId) {
        setToast(<span>Finish setting up your account to publish your ranking.</span>);
        return false;
      }
      if (ids.length === 0) return false;

      let spaces: Map<string, string>;
      try {
        spaces = await fetchDebateOwnSpaces(ids);
      } catch (error) {
        console.error('[useBestDebatesCompose] Reading debate spaces failed:', error);
        setToast(<span>Couldn’t publish your ranking. Try again.</span>);
        return false;
      }

      const slots = ids.map(id => ({ id, name: debateName(id), spaceId: spaces.get(normId(id)) }));
      const publishable = slots.filter(slot => Boolean(slot.spaceId));
      const leftOut = slots.length - publishable.length;
      if (publishable.length === 0) {
        setToast(<span>Couldn’t find the spaces of these debates, so nothing was published.</span>);
        return false;
      }

      const published = await saveMySubmission(publishable);
      if (!published) return false;

      if (leftOut > 0) {
        setToast(
          <span>
            {leftOut === 1 ? '1 debate was' : `${leftOut} debates were`} left out: its space couldn’t be found.
          </span>
        );
      }
      refreshRankersAfterIndexing(rankers, published.indexingSettled);
      onPublished?.(published);
      return true;
    },
    [debateName, onPublished, personalSpaceId, rankers, saveMySubmission, setToast]
  );

  const placement = useBestDebatesPlacement({
    blockId,
    orderedIds,
    setOrderedIds,
    hasUnpublishedChanges,
    nameOf: debateName,
    toRankIds,
    publish,
    isSaving,
    pushDown,
  });

  const startPlacement = React.useCallback(
    (entityId: string, origin: PlacementOrigin) => placement.start(entityId, origin),
    [placement]
  );

  const teamView: RankingComposeTeamView = {
    mode: teamMode,
    onModeChange: setTeamMode,
    toRankCount: toRank.isLoading || toRank.error ? null : toRankIds.length,
    toRankPanel: (
      <BestDebatesToRankList
        debates={toRank.debates}
        isLoading={toRank.isLoading}
        error={toRank.error}
        rankers={rankers}
        entriesById={toRankEntriesById}
        onPlace={entityId => startPlacement(entityId, 'to_rank')}
        draggable={!isMobile}
      />
    ),
  };

  const mobileTabs: RankingComposeMobileTabs = {
    globalLabel: 'Team ranking',
    myLabel: 'Your ranking',
    active: mobileTab,
    onChange: setMobileTab,
  };

  /** A drop from the team column or To rank: it waits for Publish, like any drag. */
  const dropEntity = React.useCallback(
    (entityId: string, index: number) => setOrderedIds(insertAt(orderedIds, entityId, index)),
    [orderedIds, setOrderedIds]
  );

  return {
    teamView,
    mobileTabs,
    dialogs: placement.dialogs,
    isPlacing: placement.isPlacing,
    /** A press on a team row places it by comparison instead of appending it. */
    placeFromTeam: (entityId: string) => startPlacement(entityId, 'team'),
    dropEntity,
    publish,
  };
}
