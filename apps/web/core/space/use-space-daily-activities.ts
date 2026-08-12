'use client';

import { usePrivy } from '@geogenesis/auth';
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import { DATA_BLOCK_TOOLS_PROPERTY_ID, LINK_INGESTION_TOOL_ID } from '~/core/blocks/data/block-ontology-ids';
import { isRollingRankingBlock } from '~/core/blocks/ranking/ensure-ranking-type';
import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDateValue,
} from '~/core/blocks/ranking/ranking-block-dates';
import { isRankingBlockEntity, isRankingSetupConfigured } from '~/core/blocks/ranking/ranking-block-state';
import { getRankingPeriodState, rankingSubmissionsOpen } from '~/core/blocks/ranking/ranking-period';
import { parseTimestampMs } from '~/core/blocks/ranking/ranking-rolling';
import { useMyRanking } from '~/core/blocks/ranking/use-my-ranking';
import { getRankingSubmissionFrequencyHours } from '~/core/blocks/ranking/use-ranking-block-config';
import { useCanUserEdit } from '~/core/hooks/use-user-is-editing';
import { ID } from '~/core/id';
import { SUBMISSION_FREQUENCY_PROPERTY_ID } from '~/core/ranking-block-ids';
import {
  type DailyActivityTask,
  RANKING_ACTIVITY_DESCRIPTION,
  UPLOAD_ACTIVITY_DESCRIPTION,
  UPLOAD_ACTIVITY_TITLE,
} from '~/core/space/daily-activities';
import {
  markDailyUploadComplete,
  msUntilNextLocalMidnight,
  readDailyUploadComplete,
} from '~/core/space/daily-activities-storage';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { mergeRelations } from '~/core/sync/orm';
import { useQueryEntity, useRelations, useValues } from '~/core/sync/use-store';

const MS_PER_HOUR = 60 * 60 * 1000;

function readBlockValue(
  values: { entity: { id: string }; property: { id: string }; spaceId: string; isDeleted?: boolean; value: string }[],
  blockId: string,
  propertyId: string,
  spaceId: string
): string {
  return (
    values.find(
      v =>
        ID.equals(v.entity.id, blockId) &&
        ID.equals(v.property.id, propertyId) &&
        ID.equals(v.spaceId, spaceId) &&
        !v.isDeleted
    )?.value ?? ''
  );
}

/**
 * Discovers ranking + link-ingestion tasks on the space overview editor.
 * Does not compute ranking completion — each ranking row does that itself so
 * React Query keys stay per-block.
 */
export function useSpaceDailyActivityTasks(spaceId: string): {
  tasks: DailyActivityTask[];
  hasLinkIngestionTool: boolean;
} {
  const { ready, authenticated } = usePrivy();
  const isSignedIn = ready && authenticated;
  const canEdit = useCanUserEdit(spaceId);
  const { blockRelations, initialBlockEntities } = useEditorStoreLite();

  const blockIds = React.useMemo(() => blockRelations.map(r => r.block.id), [blockRelations]);
  const blocksRelationEntityIds = React.useMemo(
    () => blockRelations.map(r => r.entityId).filter(Boolean),
    [blockRelations]
  );

  const typeRelations = useRelations({
    selector: r =>
      blockIds.includes(r.fromEntity.id) && r.type.id === SystemIds.TYPES_PROPERTY && ID.equals(r.spaceId, spaceId),
  });

  const blockValues = useValues({
    selector: v =>
      blockIds.includes(v.entity.id) &&
      ID.equals(v.spaceId, spaceId) &&
      !v.isDeleted &&
      (v.property.id === SystemIds.NAME_PROPERTY ||
        v.property.id === SystemIds.FILTER ||
        RANKING_DATE_PROPERTY_IDS.has(v.property.id)),
  });

  const toolRelations = useRelations({
    selector: r =>
      blocksRelationEntityIds.includes(r.fromEntity.id) &&
      ID.equals(r.type.id, DATA_BLOCK_TOOLS_PROPERTY_ID) &&
      ID.equals(r.toEntity.id, LINK_INGESTION_TOOL_ID) &&
      !r.isDeleted,
  });

  const hasLinkIngestionTool = React.useMemo(() => {
    if (toolRelations.length > 0) return true;
    return initialBlockEntities.some(entity => {
      if (!blocksRelationEntityIds.includes(entity.id)) return false;
      return (entity.relations ?? []).some(
        r =>
          !r.isDeleted &&
          ID.equals(r.type.id, DATA_BLOCK_TOOLS_PROPERTY_ID) &&
          ID.equals(r.toEntity.id, LINK_INGESTION_TOOL_ID)
      );
    });
  }, [blocksRelationEntityIds, initialBlockEntities, toolRelations.length]);

  const tasks = React.useMemo(() => {
    if (!isSignedIn) return [];

    const next: DailyActivityTask[] = [];

    for (const blockId of blockIds) {
      const initial = initialBlockEntities.find(b => b.id === blockId);
      const localTypeRelations = typeRelations.filter(r => ID.equals(r.fromEntity.id, blockId));
      const snapshotTypeRelations = (initial?.relations ?? []).filter(
        r =>
          ID.equals(r.fromEntity.id, blockId) && r.type.id === SystemIds.TYPES_PROPERTY && ID.equals(r.spaceId, spaceId)
      );
      const relationsForBlock = mergeRelations(localTypeRelations, snapshotTypeRelations).filter(r => !r.isDeleted);

      if (!isRankingBlockEntity(blockId, relationsForBlock, spaceId)) continue;

      const name =
        readBlockValue(blockValues, blockId, SystemIds.NAME_PROPERTY, spaceId).trim() ||
        initial?.name?.trim() ||
        'Untitled ranking';
      const filterValues = blockValues.filter(
        v =>
          ID.equals(v.entity.id, blockId) &&
          ID.equals(v.property.id, SystemIds.FILTER) &&
          ID.equals(v.spaceId, spaceId) &&
          !v.isDeleted
      );
      const initialFilterValues = (initial?.values ?? []).filter(
        v =>
          ID.equals(v.entity.id, blockId) &&
          ID.equals(v.property.id, SystemIds.FILTER) &&
          ID.equals(v.spaceId, spaceId) &&
          !v.isDeleted
      );

      if (!isRankingSetupConfigured(blockId, name, [...filterValues, ...initialFilterValues], spaceId)) {
        continue;
      }

      const isRolling = isRollingRankingBlock(relationsForBlock, blockId, spaceId);
      const readBlockDate = (propertyId: string) =>
        readBlockValue(blockValues, blockId, propertyId, spaceId) ||
        (initial?.values ?? []).find(
          v => ID.equals(v.property.id, propertyId) && ID.equals(v.spaceId, spaceId) && !v.isDeleted
        )?.value ||
        '';
      const startDate = resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readBlockDate);
      const endDate = resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readBlockDate);
      const periodState = getRankingPeriodState(startDate, endDate);
      const submissionsOpen = isRolling || rankingSubmissionsOpen(periodState);
      if (!submissionsOpen) continue;

      next.push({
        kind: 'ranking',
        id: `ranking:${blockId}`,
        blockId,
        title: name,
        description: RANKING_ACTIVITY_DESCRIPTION,
      });
    }

    if (hasLinkIngestionTool && canEdit) {
      next.push({
        kind: 'upload',
        id: 'upload-news-story',
        title: UPLOAD_ACTIVITY_TITLE,
        description: UPLOAD_ACTIVITY_DESCRIPTION,
      });
    }

    return next;
  }, [blockIds, blockValues, canEdit, hasLinkIngestionTool, initialBlockEntities, isSignedIn, spaceId, typeRelations]);

  return { tasks, hasLinkIngestionTool };
}

/**
 * Whether the current user has a live ranking submission for this block.
 * Rolling rankings become incomplete again after roll-off.
 */
export function useRankingDailyActivityComplete(
  blockId: string,
  spaceId: string
): {
  complete: boolean;
  isLoading: boolean;
} {
  const { myRankEntity, orderedEntityIds, isLoading } = useMyRanking(blockId);
  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === blockId) ?? null;
  const { entity: blockEntity } = useQueryEntity({ id: blockId, spaceId });

  const blockRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];
  const isRolling = React.useMemo(
    () => isRollingRankingBlock(blockRelations, blockId, spaceId),
    [blockRelations, blockId, spaceId]
  );

  const frequencyValues = useValues({
    selector: v =>
      ID.equals(v.entity.id, blockId) &&
      ID.equals(v.spaceId, spaceId) &&
      !v.isDeleted &&
      v.property.id === SUBMISSION_FREQUENCY_PROPERTY_ID,
  });
  const submissionFrequencyHours = React.useMemo(
    () => getRankingSubmissionFrequencyHours(frequencyValues),
    [frequencyValues]
  );

  const submittedAtMs = React.useMemo(
    () => (myRankEntity ? parseTimestampMs(myRankEntity.createdAt ?? myRankEntity.updatedAt) : 0),
    [myRankEntity]
  );

  const isSubmissionLive = React.useMemo(() => {
    if (!isRolling || !myRankEntity) return true;
    if (submissionFrequencyHours == null || submittedAtMs === 0) return true;
    return Date.now() < submittedAtMs + submissionFrequencyHours * MS_PER_HOUR;
  }, [isRolling, myRankEntity, submissionFrequencyHours, submittedAtMs]);

  const hasRolledOff = isRolling && Boolean(myRankEntity) && !isSubmissionLive;
  const complete = !hasRolledOff && orderedEntityIds.length > 0;

  return { complete, isLoading };
}

export function useDailyUploadActivityComplete(spaceId: string): boolean {
  const [complete, setComplete] = React.useState(false);

  React.useEffect(() => {
    setComplete(readDailyUploadComplete(spaceId));

    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith(`geogenesis.daily-activities.upload.v1:${spaceId}:`)) {
        setComplete(readDailyUploadComplete(spaceId));
      }
    };
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ spaceId: string }>).detail;
      if (detail?.spaceId === spaceId) {
        setComplete(readDailyUploadComplete(spaceId));
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('geo:daily-activities-upload', onCustom);

    const timeoutId = window.setTimeout(() => {
      setComplete(readDailyUploadComplete(spaceId));
    }, msUntilNextLocalMidnight() + 50);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('geo:daily-activities-upload', onCustom);
      window.clearTimeout(timeoutId);
    };
  }, [spaceId]);

  return complete;
}

export function completeDailyUploadActivity(spaceId: string): void {
  markDailyUploadComplete(spaceId);
}
