import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { cache } from 'react';

import { Effect } from 'effect';

import { parseFiltersSync } from '~/core/blocks/data/filters';
import {
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from '~/core/blocks/ranking/ranking-block-relations';
import { isRankingBlockEntity } from '~/core/blocks/ranking/ranking-block-state';
import { ID } from '~/core/id';
import { getAllEntities, getEntityPage } from '~/core/io/queries';
import { QUESTION_TYPE_ID } from '~/core/questions/ontology';
import {
  RANKING_BLOCK_TYPE_ID,
  RANKING_BLOCK_TYPE_NAME,
  RANKING_END_DATE_PROPERTY_ID,
  RANKING_START_DATE_PROPERTY_ID,
  RANK_POSITION_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { cachedFetchEntityPage } from '~/app/space/(entity)/[id]/[entityId]/cached-fetch-entity';
import { cachedFetchSpace } from '~/app/space/[id]/cached-fetch-space';

export type TopQuestionsRankingData = {
  blockEntityId: string;
  spaceId: string;
  parentEntityId: string;
  relationId: string;
  rankingStartDate: string;
  rankingEndDate: string;
  rankingName: string;
  orderedEntityIds: string[];
  entries: {
    entityId: string;
    name: string;
    description: string | null;
    image: string | null;
  }[];
  aggregatedSubmitterSpaceIds: string[];
  aggregatedRankingCount: number;
};

function readBlockFilterValue(block: Entity, spaceId: string): string | null {
  const filterTriple = block.values?.find(
    v =>
      v.entity.id === block.id && v.property.id === SystemIds.FILTER && v.spaceId === spaceId && !v.isDeleted && v.value
  );
  return filterTriple?.value ?? null;
}

export function blockHasQuestionTypeFilter(block: Entity, spaceId: string): boolean {
  const filterValue = readBlockFilterValue(block, spaceId);
  if (!filterValue) return false;

  const { filters } = parseFiltersSync(filterValue);
  return filters.some(f => ID.equals(f.columnId, SystemIds.TYPES_PROPERTY) && ID.equals(f.value, QUESTION_TYPE_ID));
}

export function isRankingBlock(block: Entity, spaceId: string): boolean {
  if (isRankingBlockEntity(block.id, block.relations ?? [], spaceId)) return true;

  return (block.types ?? []).some(
    type => ID.equals(type.id, RANKING_BLOCK_TYPE_ID) || type.name === RANKING_BLOCK_TYPE_NAME
  );
}

export function isTopQuestionsRankingBlock(block: Entity, spaceId: string): boolean {
  if (!isRankingBlock(block, spaceId)) return false;
  return blockHasQuestionTypeFilter(block, spaceId);
}

async function loadBlockEntity(blockId: string, spaceId: string): Promise<Entity | null> {
  const page = await cachedFetchEntityPage(blockId, spaceId);
  return page?.entity ?? null;
}

async function buildRankingDataFromBlock(
  block: Entity,
  spaceId: string,
  homeEntityId: string,
  relationId: string
): Promise<TopQuestionsRankingData> {
  const page = await Effect.runPromise(getEntityPage(block.id, spaceId));
  const relations = page?.relations?.length ? page.relations : (page?.entity?.relations ?? block.relations ?? []);

  const orderedEntityIds = getOrderedRelationTargetIds(relations, block.id, RANK_POSITION_PROPERTY_ID, spaceId);
  const submitterRefs = getAggregatedRankingSubmitterRefs(relations, block.id, spaceId);
  const aggregatedSubmitterSpaceIds = submitterRefs.map(ref => ref.spaceId).filter((id): id is string => Boolean(id));
  const aggregatedRankingCount = getAggregatedRankingSubmissionCount(relations, block.id, spaceId);

  let entries: TopQuestionsRankingData['entries'] = [];
  if (orderedEntityIds.length > 0) {
    const { entities } = await Effect.runPromise(
      getAllEntities({ filter: { id: { in: orderedEntityIds } }, spaceId, limit: orderedEntityIds.length })
    );
    const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
    entries = orderedEntityIds.map(entityId => {
      const entity = entitiesById.get(entityId);
      return {
        entityId,
        name: entity?.name?.trim() || 'Untitled',
        description: entity?.description?.trim() || null,
        image: Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? null,
      };
    });
  }

  const rankingStartDate =
    block.values?.find(
      v =>
        v.entity.id === block.id &&
        v.property.id === RANKING_START_DATE_PROPERTY_ID &&
        v.spaceId === spaceId &&
        !v.isDeleted
    )?.value ?? '';
  const rankingEndDate =
    block.values?.find(
      v =>
        v.entity.id === block.id &&
        v.property.id === RANKING_END_DATE_PROPERTY_ID &&
        v.spaceId === spaceId &&
        !v.isDeleted
    )?.value ?? '';

  return {
    blockEntityId: block.id,
    spaceId,
    parentEntityId: homeEntityId,
    relationId,
    rankingStartDate,
    rankingEndDate,
    rankingName: block.name?.trim() || 'Top questions',
    orderedEntityIds,
    entries,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
  };
}

async function findTopQuestionsBlockOnHomeEntity(
  spaceId: string,
  homeEntityId: string
): Promise<{ block: Entity; relationId: string } | null> {
  const homePage = await cachedFetchEntityPage(homeEntityId, spaceId);
  const homeRelations = homePage?.relations?.length ? homePage.relations : (homePage?.entity?.relations ?? []);

  const blockRelations = homeRelations.filter(r => r.type.id === SystemIds.BLOCKS && !r.isDeleted);
  for (const relation of blockRelations) {
    const blockId = relation.toEntity.id;
    if (!blockId) continue;

    const block = await loadBlockEntity(blockId, spaceId);
    if (block && isTopQuestionsRankingBlock(block, spaceId)) {
      return { block, relationId: relation.id };
    }
  }

  return null;
}

async function findTopQuestionsBlockInSpace(spaceId: string): Promise<Entity | null> {
  const { entities } = await Effect.runPromise(
    getAllEntities({
      spaceId,
      typeId: RANKING_BLOCK_TYPE_ID,
      limit: 50,
    })
  );

  for (const candidate of entities) {
    const block = await loadBlockEntity(candidate.id, spaceId);
    if (block && isTopQuestionsRankingBlock(block, spaceId)) {
      return block;
    }
  }

  return null;
}

export const fetchTopQuestionsRanking = cache(async (spaceId: string): Promise<TopQuestionsRankingData | null> => {
  const space = await cachedFetchSpace(spaceId);
  const homeEntity = space?.entity;
  if (!homeEntity) return null;

  const onHome = await findTopQuestionsBlockOnHomeEntity(spaceId, homeEntity.id);
  if (onHome) {
    return buildRankingDataFromBlock(onHome.block, spaceId, homeEntity.id, onHome.relationId);
  }

  const inSpace = await findTopQuestionsBlockInSpace(spaceId);
  if (!inSpace) return null;

  return buildRankingDataFromBlock(inSpace, spaceId, homeEntity.id, '');
});
