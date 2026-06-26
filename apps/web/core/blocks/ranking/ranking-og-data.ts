import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getAllEntities, getEntity, getEntityPage } from '~/core/io/queries';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { RANK_TYPE_ID, RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';
import { RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity, Profile, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import {
  type FetchRankingPendingEntitiesOptions,
  fetchRankingPendingEntities,
} from './fetch-ranking-pending-proposals';
import { getMyRankingOrderedEntityIds, isRankSubmittedToBlock } from './my-ranking-entity';
import { filterEntityRelationsByType } from './ranking-block-relations';
import { getAggregatedRankingSubmitterSpaceIds, getOrderedRelationTargetIds } from './ranking-block-relations';
import { type RankingPendingProposalData, isPlaceholderRankingEntry } from './ranking-pending-proposal-entries';
import { formatRankingPeriodLabel, getRankingPeriodState } from './ranking-period';

export type RankingOgEntryData = {
  entityId: string;
  name: string;
  description: string | null;
  image: string | null;
};

export type RankingOgCardKind = 'personal' | 'global';

export type RankingOgCardData = {
  kind?: RankingOgCardKind;
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingName: string;
  title: string;
  periodLabel: string | null;
  author: {
    name: string;
    avatarUrl: string | null;
    avatarSeed: string;
  };
  entries: RankingOgEntryData[];
};

export type RankingOgDataInput = {
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

export type GlobalRankingOgDataInput = {
  blockEntityId: string;
  blockEntitySpaceId: string;
  rankingStartDate?: string;
  rankingEndDate?: string;
};

type RankingOgDataDeps = {
  fetchEntity: (entityId: string, spaceId?: string) => Promise<Entity | null>;
  fetchEntityPage: (entityId: string, spaceId?: string) => Promise<{ entity: Entity; relations: Relation[] } | null>;
  fetchEntities: (entityIds: string[], spaceId?: string) => Promise<Entity[]>;
  fetchProfile: (spaceId: string) => Promise<Profile>;
  fetchPendingEntries?: (options: FetchRankingPendingEntitiesOptions) => Promise<RankingPendingProposalData>;
};

const defaultDeps: RankingOgDataDeps = {
  fetchEntity: (entityId, spaceId) => Effect.runPromise(getEntity(entityId, spaceId)),
  fetchEntityPage: async (entityId, spaceId) => {
    const page = await Effect.runPromise(getEntityPage(entityId, spaceId));
    if (!page?.entity) return null;
    return { entity: page.entity, relations: page.relations };
  },
  fetchEntities: async (entityIds, spaceId) => {
    if (entityIds.length === 0) return [];
    const { entities } = await Effect.runPromise(
      getAllEntities({
        filter: { id: { in: entityIds } },
        spaceId,
        limit: entityIds.length,
      })
    );
    return entities;
  },
  fetchProfile: spaceId => Effect.runPromise(fetchProfileBySpaceId(spaceId)),
};

async function resolveEntityRelations(
  deps: RankingOgDataDeps,
  entityId: string,
  spaceId?: string
): Promise<{ entity: Entity; relations: Relation[] } | null> {
  const page = await deps.fetchEntityPage(entityId, spaceId);
  if (page?.entity) {
    return {
      entity: page.entity,
      relations: page.relations.length > 0 ? page.relations : (page.entity.relations ?? []),
    };
  }

  const entity = await deps.fetchEntity(entityId, spaceId);
  if (!entity) return null;
  return { entity, relations: entity.relations ?? [] };
}

function hasRankType(entity: Entity): boolean {
  return entity.types.some(type => type.id === RANK_TYPE_ID);
}

function profileName(profile: Profile, authorSpaceId: string): string {
  return profile.name?.trim() || `Geo curator ${authorSpaceId.slice(0, 6)}`;
}

function profileAvatar(profile: Profile): string | null {
  if (!profile.avatarUrl || profile.avatarUrl === PLACEHOLDER_SPACE_IMAGE) return null;
  return profile.avatarUrl;
}

function entityDisplay(entity: Entity | undefined, entityId: string): RankingOgEntryData {
  return {
    entityId,
    name: entity?.name?.trim() || 'Untitled',
    description: entity?.description?.trim() || Entities.description(entity?.values ?? [])?.trim() || null,
    image: Entities.cover(entity?.relations) ?? Entities.avatar(entity?.relations) ?? null,
  };
}

// Server-side OG generation only sees the published index, so a ranked entity
// that's still in an open proposal renders as "Untitled". Mirror the in-app
// ranking flow and backfill placeholder names from the proposer's pending edits.
async function backfillPendingNames(
  deps: RankingOgDataDeps,
  entries: RankingOgEntryData[],
  targetSpaceId: string,
  proposerSpaceIds: string[]
): Promise<RankingOgEntryData[]> {
  const unresolvedEntityIds = entries.filter(entry => isPlaceholderRankingEntry(entry)).map(entry => entry.entityId);
  if (unresolvedEntityIds.length === 0 || proposerSpaceIds.length === 0) return entries;

  const fetchPending = deps.fetchPendingEntries ?? fetchRankingPendingEntities;
  const { entriesByEntityId } = await fetchPending({ spaceId: targetSpaceId, unresolvedEntityIds, proposerSpaceIds });
  if (entriesByEntityId.size === 0) return entries;

  return entries.map(entry => {
    const pending = isPlaceholderRankingEntry(entry) ? entriesByEntityId.get(entry.entityId) : undefined;
    // The proposal diff carries name/description but not the cover, so a pending
    // entry keeps its (null) image.
    return pending ? { ...entry, name: pending.name, description: pending.description ?? entry.description } : entry;
  });
}

function periodLabel(startDate = '', endDate = ''): string | null {
  if (!startDate && !endDate) return null;
  const state = getRankingPeriodState(startDate, endDate);
  return formatRankingPeriodLabel(state, startDate, endDate);
}

export async function getRankingOgCardData(
  input: RankingOgDataInput,
  deps: RankingOgDataDeps = defaultDeps
): Promise<RankingOgCardData | null> {
  const rankPage = await resolveEntityRelations(deps, input.rankEntityId, input.authorSpaceId);
  const rankEntity = rankPage?.entity;
  if (!rankEntity || !hasRankType(rankEntity)) return null;
  if (
    !isRankSubmittedToBlock({ ...rankEntity, relations: rankPage.relations }, input.authorSpaceId, input.blockEntityId)
  ) {
    return null;
  }

  const rankingBlock = await deps.fetchEntity(input.blockEntityId, input.blockEntitySpaceId);
  const rankingName = rankingBlock?.name?.trim() || rankEntity.name?.trim() || 'Untitled ranking';
  const orderedEntityIds = getMyRankingOrderedEntityIds(
    rankEntity.id,
    filterEntityRelationsByType(rankPage.relations, rankEntity.id, RANK_VOTES_RELATION_TYPE_ID, input.authorSpaceId),
    input.authorSpaceId
  ).slice(0, 5);
  const [entities, profile] = await Promise.all([
    deps.fetchEntities(orderedEntityIds, input.blockEntitySpaceId),
    deps.fetchProfile(input.authorSpaceId),
  ]);
  const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
  const baseEntries = orderedEntityIds.map(entityId => entityDisplay(entitiesById.get(entityId), entityId));
  // The author is the proposer for their own pending entries; look in the block's space.
  const entries = await backfillPendingNames(deps, baseEntries, input.blockEntitySpaceId, [input.authorSpaceId]);
  const authorName = profileName(profile, input.authorSpaceId);

  return {
    kind: 'personal',
    rankEntityId: input.rankEntityId,
    authorSpaceId: input.authorSpaceId,
    blockEntityId: input.blockEntityId,
    blockEntitySpaceId: input.blockEntitySpaceId,
    rankingName,
    title: rankingName,
    periodLabel: periodLabel(input.rankingStartDate, input.rankingEndDate),
    author: {
      name: authorName,
      avatarUrl: profileAvatar(profile),
      avatarSeed: profile.address ?? profile.spaceId ?? input.authorSpaceId,
    },
    entries,
  };
}

export async function getGlobalRankingOgCardData(
  input: GlobalRankingOgDataInput,
  deps: RankingOgDataDeps = defaultDeps
): Promise<RankingOgCardData | null> {
  const blockPage = await resolveEntityRelations(deps, input.blockEntityId, input.blockEntitySpaceId);
  if (!blockPage) return null;

  const orderedEntityIds = getOrderedRelationTargetIds(
    blockPage.relations,
    input.blockEntityId,
    RANK_POSITION_PROPERTY_ID,
    input.blockEntitySpaceId
  ).slice(0, 5);
  const [entities] = await Promise.all([deps.fetchEntities(orderedEntityIds, input.blockEntitySpaceId)]);
  const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
  const rankingName = blockPage.entity.name?.trim() || 'Untitled ranking';
  const baseEntries = orderedEntityIds.map(entityId => entityDisplay(entitiesById.get(entityId), entityId));
  // Submitters (their `to_space`) are the proposers for the global leaderboard's pending entries.
  const submitterSpaceIds = getAggregatedRankingSubmitterSpaceIds(
    blockPage.relations,
    input.blockEntityId,
    input.blockEntitySpaceId
  );
  const entries = await backfillPendingNames(deps, baseEntries, input.blockEntitySpaceId, submitterSpaceIds);

  return {
    kind: 'global',
    rankEntityId: '',
    authorSpaceId: '',
    blockEntityId: input.blockEntityId,
    blockEntitySpaceId: input.blockEntitySpaceId,
    rankingName,
    title: rankingName,
    periodLabel: periodLabel(input.rankingStartDate, input.rankingEndDate),
    author: {
      name: '',
      avatarUrl: null,
      avatarSeed: input.blockEntityId,
    },
    entries,
  };
}
