import { IdUtils, SystemIds } from '@geoprotocol/geo-sdk/lite';

import { cache } from 'react';

import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getAllEntities, getEntity, getEntityPage, getRelationsByToEntityIds } from '~/core/io/queries';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import {
  RANKING_END_TIME_PROPERTY_ID,
  RANKING_START_TIME_PROPERTY_ID,
  RANK_POSITION_PROPERTY_ID,
  RANK_TYPE_ID,
} from '~/core/ranking-block-ids';
import type { Entity, Profile, Relation } from '~/core/types';
import { Entities } from '~/core/utils/entity';

import { getMyRankingOrderedEntityIds, getSubmittedBlockIdFromRank } from './my-ranking-entity';
import { getOrderedRelationTargetIds } from './ranking-block-relations';
import {
  type RankingOgCardData,
  type RankingOgEntryData,
  getGlobalRankingOgCardData,
  getRankingOgCardData,
} from './ranking-og-data';
import { buildGlobalRankingOgVersion, buildRankingOgVersion } from './ranking-og-version';

export type ResolvedPersonalRankingShare = {
  kind: 'personal';
  rankEntityId: string;
  authorSpaceId: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
  /** Block placement in its parent — may be '' when the BLOCKS relation can't be resolved. */
  parentEntityId: string;
  relationId: string;
  rankingStartDate: string;
  rankingEndDate: string;
  rankingName: string;
  /** Raw author display name (empty when the author has no profile name). */
  authorName: string;
  /** Recomputed to match the publish-time inputs so the R2 fast path hits. */
  ogVersion: string;
  cardData: RankingOgCardData;
  /** Full ordered ranking, resolved server-side so the shared ranking renders all rows on first paint. */
  orderedEntityIds: string[];
  entries: RankingOgEntryData[];
};

export type ResolvedGlobalRankingShare = {
  kind: 'global';
  blockEntityId: string;
  blockEntitySpaceId: string;
  parentEntityId: string;
  relationId: string;
  rankingStartDate: string;
  rankingEndDate: string;
  rankingName: string;
  globalOgVersion: string;
  cardData: RankingOgCardData;
  /** Full ordered ranking, resolved server-side so the page renders all rows on first paint. */
  orderedEntityIds: string[];
  entries: RankingOgEntryData[];
};

type ToEntityRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  spaceId: string;
};

export type ResolveRankingShareDeps = {
  fetchEntity: (entityId: string, spaceId?: string) => Promise<Entity | null>;
  fetchEntityPage: (entityId: string, spaceId?: string) => Promise<{ entity: Entity; relations: Relation[] } | null>;
  fetchRelationsByToEntity: (blockEntityId: string, typeId: string, spaceId: string) => Promise<ToEntityRelation[]>;
  fetchProfile: (spaceId: string) => Promise<Profile | null>;
  fetchEntities: (entityIds: string[], spaceId?: string) => Promise<Entity[]>;
  fetchPersonalCardData: typeof getRankingOgCardData;
  fetchGlobalCardData: typeof getGlobalRankingOgCardData;
};

const defaultDeps: ResolveRankingShareDeps = {
  fetchEntity: (entityId, spaceId) => Effect.runPromise(getEntity(entityId, spaceId)),
  fetchEntityPage: async (entityId, spaceId) => {
    const page = await Effect.runPromise(getEntityPage(entityId, spaceId));
    if (!page?.entity) return null;
    return { entity: page.entity, relations: page.relations };
  },
  fetchRelationsByToEntity: (blockEntityId, typeId, spaceId) =>
    Effect.runPromise(getRelationsByToEntityIds([blockEntityId], typeId, spaceId)) as unknown as Promise<
      ToEntityRelation[]
    >,
  fetchProfile: async spaceId => {
    try {
      return await Effect.runPromise(fetchProfileBySpaceId(spaceId));
    } catch {
      return null;
    }
  },
  fetchEntities: async (entityIds, spaceId) => {
    if (entityIds.length === 0) return [];
    const { entities } = await Effect.runPromise(
      getAllEntities({ filter: { id: { in: entityIds } }, spaceId, limit: entityIds.length })
    );
    return entities;
  },
  fetchPersonalCardData: getRankingOgCardData,
  fetchGlobalCardData: getGlobalRankingOgCardData,
};

function readDateValue(entity: Entity | null | undefined, propertyId: string, spaceId: string): string {
  if (!entity?.values) return '';
  const value = entity.values.find(v => v.property.id === propertyId && v.spaceId === spaceId && !v.isDeleted);
  return value?.value ?? '';
}

function profileAvatar(profile: Profile | null): string | null {
  if (!profile?.avatarUrl || profile.avatarUrl === PLACEHOLDER_SPACE_IMAGE) return null;
  return profile.avatarUrl;
}

function pickPrimarySpace(spaceIds: string[] | undefined): string {
  return spaceIds?.[0] ?? '';
}

/**
 * Find where the block is embedded (its parent entity + the relation id of that
 * containment). The block is the target of a `BLOCKS` relation from its parent.
 * Best-effort: returns empty strings when the relation can't be found.
 */
async function resolveBlockPlacement(
  deps: ResolveRankingShareDeps,
  blockEntityId: string,
  blockEntitySpaceId: string
): Promise<{ parentEntityId: string; relationId: string }> {
  try {
    const relations = await deps.fetchRelationsByToEntity(blockEntityId, SystemIds.BLOCKS, blockEntitySpaceId);
    if (!relations || relations.length === 0) return { parentEntityId: '', relationId: '' };
    if (relations.length > 1) {
      console.warn(`[resolve-ranking-share] multiple BLOCKS parents for block ${blockEntityId}; using first match`);
    }
    const match = relations.find(r => r.spaceId === blockEntitySpaceId) ?? relations[0];
    return { parentEntityId: match.fromEntityId ?? '', relationId: match.id ?? '' };
  } catch {
    return { parentEntityId: '', relationId: '' };
  }
}

export async function resolvePersonalRankingShareImpl(
  rankEntityId: string,
  deps: ResolveRankingShareDeps = defaultDeps
): Promise<ResolvedPersonalRankingShare | null> {
  if (!IdUtils.isValid(rankEntityId)) return null;

  // 1. Resolve the rank entity unscoped to learn which space(s) it lives in.
  const rank = await deps.fetchEntity(rankEntityId);
  if (!rank || !rank.types.some(type => type.id === RANK_TYPE_ID)) return null;

  // 2. Find the author space whose page actually carries the rank's SUBMITTED_TO
  //    relation, and the block it points at. A RANK entity is created in exactly
  //    one personal space, so this normally resolves on the first candidate.
  let authorSpaceId = '';
  let blockEntityId = '';
  let rankRelations: Relation[] = [];
  for (const candidate of rank.spaces ?? []) {
    const page = await deps.fetchEntityPage(rankEntityId, candidate);
    const relations = page?.relations?.length ? page.relations : (page?.entity.relations ?? []);
    const submittedBlockId = getSubmittedBlockIdFromRank(relations, candidate);
    if (submittedBlockId) {
      authorSpaceId = candidate;
      blockEntityId = submittedBlockId;
      rankRelations = relations;
      break;
    }
  }
  if (!authorSpaceId || !blockEntityId) return null;

  // 3. Resolve the block: its space, name, and persisted date window.
  const blockUnscoped = await deps.fetchEntity(blockEntityId);
  const blockEntitySpaceId = pickPrimarySpace(blockUnscoped?.spaces);
  if (!blockEntitySpaceId) return null;
  const blockScoped = await deps.fetchEntity(blockEntityId, blockEntitySpaceId);
  const rankingName = blockScoped?.name?.trim() || 'Untitled ranking';
  const rankingStartDate = readDateValue(blockScoped, RANKING_START_TIME_PROPERTY_ID, blockEntitySpaceId);
  const rankingEndDate = readDateValue(blockScoped, RANKING_END_TIME_PROPERTY_ID, blockEntitySpaceId);

  // 4. Build the OG card data with the resolved coordinates.
  const cardData = await deps.fetchPersonalCardData({
    rankEntityId,
    authorSpaceId,
    blockEntityId,
    blockEntitySpaceId,
    rankingStartDate,
    rankingEndDate,
  });
  if (!cardData) return null;

  // 5. Recompute ogVersion mirroring the publish flow's inputs
  //    (use-ranking-block-state.ts `effectiveOgVersion`): the FULL ordered ids,
  //    the block name, and the raw profile name/avatar — not the top-5 card slice.
  const profile = await deps.fetchProfile(authorSpaceId);
  const orderedEntityIds = getMyRankingOrderedEntityIds({ ...rank, relations: rankRelations }, authorSpaceId);
  const authorName = profile?.name?.trim() ?? '';
  const ogVersion = buildRankingOgVersion({
    rankEntityId,
    orderedEntityIds,
    rankingName,
    rankingStartDate,
    rankingEndDate,
    authorName,
    authorAvatarUrl: profileAvatar(profile),
  });

  // 6. Resolve placement for back-navigation / vote / "add my ranking".
  const { parentEntityId, relationId } = await resolveBlockPlacement(deps, blockEntityId, blockEntitySpaceId);

  // 7. Resolve the full ordered ranking (names + images) server-side so the
  //    shared view paints every row immediately instead of cascading through
  //    "loading" -> "empty" -> "Untitled" -> resolved on the client. Shape
  //    matches the client's RankingEntryDisplay so seeded rows reconcile against
  //    the live query without a swap (mirrors the global resolver).
  const rankedEntities = await deps.fetchEntities(orderedEntityIds, blockEntitySpaceId);
  const rankedEntityById = new Map(rankedEntities.map(e => [e.id, e]));
  const entries: RankingOgEntryData[] = orderedEntityIds.map(id => {
    const entity = rankedEntityById.get(id);
    return {
      entityId: id,
      name: entity?.name?.trim() || 'Untitled',
      description: entity?.description?.trim() || null,
      image: Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? null,
    };
  });

  return {
    kind: 'personal',
    rankEntityId,
    authorSpaceId,
    blockEntityId,
    blockEntitySpaceId,
    parentEntityId,
    relationId,
    rankingStartDate,
    rankingEndDate,
    rankingName,
    authorName,
    ogVersion,
    cardData,
    orderedEntityIds,
    entries,
  };
}

export async function resolveGlobalRankingShareImpl(
  blockEntityId: string,
  deps: ResolveRankingShareDeps = defaultDeps
): Promise<ResolvedGlobalRankingShare | null> {
  if (!IdUtils.isValid(blockEntityId)) return null;

  const blockUnscoped = await deps.fetchEntity(blockEntityId);
  if (!blockUnscoped) return null;
  const blockEntitySpaceId = pickPrimarySpace(blockUnscoped.spaces);
  if (!blockEntitySpaceId) return null;

  const page = await deps.fetchEntityPage(blockEntityId, blockEntitySpaceId);
  const blockScoped = page?.entity ?? (await deps.fetchEntity(blockEntityId, blockEntitySpaceId));
  const relations = page?.relations?.length ? page.relations : (blockScoped?.relations ?? []);
  const rankingName = blockScoped?.name?.trim() || 'Untitled ranking';
  const rankingStartDate = readDateValue(blockScoped, RANKING_START_TIME_PROPERTY_ID, blockEntitySpaceId);
  const rankingEndDate = readDateValue(blockScoped, RANKING_END_TIME_PROPERTY_ID, blockEntitySpaceId);

  const cardData = await deps.fetchGlobalCardData({
    blockEntityId,
    blockEntitySpaceId,
    rankingStartDate,
    rankingEndDate,
  });
  if (!cardData) return null;

  // Mirror the publish flow's `effectiveGlobalOgVersion`: full ordered ids by
  // RANK_POSITION, block name, dates.
  const orderedEntityIds = getOrderedRelationTargetIds(
    relations,
    blockEntityId,
    RANK_POSITION_PROPERTY_ID,
    blockEntitySpaceId
  );
  const globalOgVersion = buildGlobalRankingOgVersion({
    blockEntityId,
    orderedEntityIds,
    rankingName,
    rankingStartDate,
    rankingEndDate,
  });

  // Shape matches the client's RankingEntryDisplay (avatar before cover, plain
  // description) so the seeded rows reconcile against the live query without a swap.
  const rankedEntities = await deps.fetchEntities(orderedEntityIds, blockEntitySpaceId);
  const rankedEntityById = new Map(rankedEntities.map(e => [e.id, e]));
  const entries: RankingOgEntryData[] = orderedEntityIds.map(id => {
    const entity = rankedEntityById.get(id);
    return {
      entityId: id,
      name: entity?.name?.trim() || 'Untitled',
      description: entity?.description?.trim() || null,
      image: Entities.avatar(entity?.relations) ?? Entities.cover(entity?.relations) ?? null,
    };
  });

  const { parentEntityId, relationId } = await resolveBlockPlacement(deps, blockEntityId, blockEntitySpaceId);

  return {
    kind: 'global',
    blockEntityId,
    blockEntitySpaceId,
    parentEntityId,
    relationId,
    rankingStartDate,
    rankingEndDate,
    rankingName,
    globalOgVersion,
    cardData,
    orderedEntityIds,
    entries,
  };
}

// Wrap in React cache so generateMetadata and the page share a single resolution
// per request (Next.js dedupes within a render pass).
export const resolvePersonalRankingShare = cache((rankEntityId: string) =>
  resolvePersonalRankingShareImpl(rankEntityId)
);

export const resolveGlobalRankingShare = cache((blockEntityId: string) => resolveGlobalRankingShareImpl(blockEntityId));
