'use client';

import * as React from 'react';

import { fetchDebateOwnSpaces } from '~/core/blocks/ranking/best-debates-debates';
import { type BallotGrades, NO_GRADES, sortIntoTiers } from '~/core/blocks/ranking/ranking-grades';
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
import { gradesForOrder } from '../use-ranking-compose-draft';
import { useSerialRuns } from './best-debate-grading';
import { BestDebatesTeamRowContent } from './best-debates-team-row';
import { useBestDebatesTeamTools } from './best-debates-team-tools';
import { BestDebatesToRankList } from './best-debates-to-rank-list';
import type { PushDownSlot } from './push-down-slot';
import { type PlacementOrigin, useBestDebatesPlacement } from './use-best-debates-placement';

export type UseBestDebatesComposeArgs = {
  /** False on every other ranking block: every read is off and nothing here is used. */
  enabled: boolean;
  blockId: string;
  /** The block's space (the Debates space); its members and editors are the rankers. */
  blockSpaceId: string;
  isMobile: boolean;
  orderedIds: string[];
  /** The draft's grades (GEO-3729): every publish sends each entry's grade. */
  grades?: BallotGrades;
  setOrderedIds: (ids: string[], movedId?: string) => void;
  hasUnpublishedChanges: boolean;
  nameOf: (entityId: string) => string | null;
  personalSpaceId: string | null | undefined;
  saveMySubmission: (slots: RankingSubmissionSlot[]) => Promise<RankingSubmissionPublishResult | null>;
  isSaving: boolean;
  /**
   * Runs after each publish that went out, with the ids this device sent (the screen generates its
   * share images there, and folds the published ballot back into its draft).
   */
  onPublished?: (published: RankingSubmissionPublishResult, sentIds: string[], sentGrades: BallotGrades) => void;
  /** Done publishes (see `useBestDebatesPlacement`). Off here: the screen's Publish sends everything. */
  publishOnDone?: boolean;
  /** The team column's search, which To rank filters by too. */
  searchQuery?: string;
  /** Open the team column on To rank (the screen was opened with `?team=to-rank`, GEO-3677). */
  openOnToRank?: boolean;
  /** GEO-3679 fills this: Push it down (team and To rank rows), and the debates to keep out of To rank. */
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
  grades = NO_GRADES,
  setOrderedIds,
  hasUnpublishedChanges,
  nameOf,
  personalSpaceId,
  saveMySubmission,
  isSaving,
  onPublished,
  openOnToRank = false,
  pushDown,
  searchQuery = '',
  publishOnDone = false,
}: UseBestDebatesComposeArgs) {
  const tools = useBestDebatesTeamTools();
  const [, setToast] = useToast();
  const [teamMode, setTeamMode] = React.useState<RankingComposeTeamMode>(openOnToRank ? 'to_rank' : 'all');
  const [mobileTab, setMobileTab] = React.useState<RankingComposeMobileTab>('global');

  const rankers: RankersRead = useBlockRankers({ blockId: enabled ? blockId : null, spaceId: blockSpaceId });

  const excludeFromToRank = React.useMemo(
    () => [...orderedIds, ...(pushDown?.pushedDownEntityIds ?? [])],
    [orderedIds, pushDown?.pushedDownEntityIds]
  );
  const toRank = useBestDebatesToRank({ enabled, excludeEntityIds: excludeFromToRank, rankers });
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

  // The draft as it stands, for a publish of an order built from it (a placement's insert).
  const latestDraft = React.useRef({ ids: orderedIds, grades });
  latestDraft.current = { ids: orderedIds, grades };

  /**
   * Publishes `ids` as one ballot edit, each entry with its grade: `grades` when given, else the
   * draft's, with a debate that joins taking the tier it lands in (`gradesForOrder`). Each item is filed under the debate's own space (see
   * `best-debates-debates.ts`); a debate whose space can't be found is left out and the ranker told,
   * never filed under the block's space. No vote is cast.
   */
  const publishNow = React.useCallback(
    async (ids: string[], givenGrades?: BallotGrades): Promise<boolean> => {
      if (!personalSpaceId) {
        setToast(<span>Finish setting up your account to publish your ranking.</span>);
        return false;
      }
      // An empty list is allowed: it clears the ranker's ballot (Preston, 12 Nov).

      let spaces: Map<string, string>;
      try {
        spaces = await fetchDebateOwnSpaces(ids);
      } catch (error) {
        console.error('[useBestDebatesCompose] Reading debate spaces failed:', error);
        setToast(<span>Couldn’t publish your ranking. Try again.</span>);
        return false;
      }

      const draft = latestDraft.current;
      const sentGrades = givenGrades ?? gradesForOrder(draft.ids, draft.grades, ids);
      // Always tier-ordered (GEO-3729): a ballot an agent wrote out of order goes out in tiers.
      const slots = sortIntoTiers(ids, sentGrades).map(id => ({
        id,
        name: debateName(id),
        spaceId: spaces.get(normId(id)),
        // Explicit for every entry: this list is the whole ballot, grades included.
        grade: sentGrades.get(normId(id)) ?? null,
      }));
      const publishable = slots.filter(slot => Boolean(slot.spaceId));
      const leftOut = slots.length - publishable.length;
      if (slots.length > 0 && publishable.length === 0) {
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
      onPublished?.(
        published,
        publishable.map(slot => slot.id),
        sentGrades
      );
      return true;
    },
    [debateName, onPublished, personalSpaceId, rankers, saveMySubmission, setToast]
  );

  // One publish at a time from here (GEO-3729): a placement's Done and the popup's grades on the
  // block both publish through this, and the ballot publisher refuses a second publish while one
  // is out.
  const { run: publish, whenSettled: whenPublishesSettle } = useSerialRuns(publishNow);

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
    publishOnDone,
  });

  const startPlacement = React.useCallback(
    (entityId: string, origin: PlacementOrigin) => placement.start(entityId, origin),
    [placement]
  );

  const teamView: RankingComposeTeamView = {
    mode: teamMode,
    onModeChange: setTeamMode,
    toRankCount: toRank.isLoading || toRank.error ? null : toRankIds.length,
    tools,
    toRankIds,
    // All and To rank draw the same row (Preston, 12 Nov): badge, Rank button or "You: #N", grip.
    renderRow: ({ entityId, name, rank, spaceId: rowSpaceId, isInMyRanking }) => (
      <BestDebatesTeamRowContent
        entityId={entityId}
        name={name}
        spaceId={rowSpaceId}
        rank={rank}
        rankers={rankers}
        myRank={isInMyRanking ? orderedIds.indexOf(entityId) + 1 || null : null}
        draggable={!isMobile && !isInMyRanking}
        onPushDown={pushDown && !isInMyRanking ? () => placement.requestPushDown(entityId) : undefined}
        onRank={isInMyRanking ? undefined : () => startPlacement(entityId, 'team')}
      />
    ),
    toRankPanel: (
      <BestDebatesToRankList
        debates={toRank.debates}
        isLoading={toRank.isLoading}
        error={toRank.error}
        rankers={rankers}
        entriesById={toRankEntriesById}
        onPlace={entityId => startPlacement(entityId, 'to_rank')}
        draggable={!isMobile}
        query={searchQuery}
        topicIds={tools.topicIds}
        onPushDown={pushDown ? placement.requestPushDown : undefined}
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
    /** The To rank debates, for the screen's row display read. */
    toRankIds,
    dialogs: placement.dialogs,
    isPlacing: placement.isPlacing,
    activeEntityId: placement.activeEntityId,
    /** A team row's Rank button places it by comparison instead of appending it. */
    placeFromTeam: (entityId: string) => startPlacement(entityId, 'team'),
    dropEntity,
    publish,
    whenPublishesSettle,
    /** Down rank from a row (waits for the ranker's vote, then the toast with Undo). */
    requestPushDown: placement.requestPushDown,
    /** For a coverage line in To rank's terms: the window's debates, and how many are left to rank. */
    toRankCoverage:
      toRank.isLoading || toRank.error
        ? null
        : { total: toRank.windowCount, left: Math.min(toRankIds.length, toRank.windowCount) },
  };
}
