import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { Effect } from 'effect';

import {
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDateValue,
} from '~/core/blocks/ranking/ranking-block-dates';
import {
  type AggregatedRankingSubmitterRef,
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from '~/core/blocks/ranking/ranking-block-relations';
import { getRankingPeriodState, rankingSubmissionsOpen } from '~/core/blocks/ranking/ranking-period';
import { FEATURED_TAG_ID, TAG_PROPERTY_ID } from '~/core/constants';
import type { EntityFilter } from '~/core/gql/graphql';
import { getAllEntities, getEntityPage, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import { RANKING_BLOCK_TYPE_ID, RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';
import { Entities } from '~/core/utils/entity';
import { mapWithConcurrency } from '~/core/utils/map-with-concurrency';
import { normId } from '~/core/utils/norm-id';

// A featured ranking is a Ranking Block entity carrying a TAG_PROPERTY relation
// to the Featured tag entity. We surface only the ones whose voting window is
// currently open ("live"), each resolved down to the coordinates the fullscreen
// vote view needs (space + block + parent placement).
export interface FeaturedRankingEntry {
  entityId: string;
  name: string;
  image: string | null;
}

export interface FeaturedRanking {
  blockEntityId: string;
  spaceId: string;
  /** Parent entity the block is embedded in (via the BLOCKS relation). */
  parentEntityId: string;
  /** Id of the BLOCKS relation binding the block to its parent. */
  relationId: string;
  name: string;
  rankingStartDate: string;
  rankingEndDate: string;
  /** Personal spaces that submitted a ranking — feeds the "Ranked by" avatars. */
  submitterSpaceIds: string[];
  submissionCount: number;
  /** Name/image of the space the block lives in — feeds the card's space badge. */
  spaceName: string | null;
  spaceImage: string | null;
  /** Current aggregated leaderboard, best first — the card pages through it in threes. */
  topEntries: FeaturedRankingEntry[];
}

// Pull a small window of candidates, then keep only the live ones. A handful of
// featured rankings is expected, so these caps are comfortably above real usage
// while bounding SSR cost.
const MAX_CANDIDATES = 25;
const MAX_FEATURED_RANKINGS = 10;
const RESOLVE_CONCURRENCY = 6;

// The card shows three leaderboard entries per page; nine covers three pages
// without fetching the whole standings.
const MAX_TOP_ENTRIES = 9;

// Entities that are Ranking Blocks AND tagged Featured.
const FEATURED_RANKINGS_FILTER: EntityFilter = {
  and: [
    { relations: { some: { typeId: { is: SystemIds.TYPES_PROPERTY }, toEntityId: { is: RANKING_BLOCK_TYPE_ID } } } },
    { relations: { some: { typeId: { is: TAG_PROPERTY_ID }, toEntityId: { is: FEATURED_TAG_ID } } } },
  ],
};

// Raw shape of the BLOCKS relations returned by getRelationsByToEntityIds
// (undecoded — mirrors resolve-ranking-share's placement resolution).
type ToEntityRelation = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  spaceId: string;
};

function readDateValue(entity: Entity | null | undefined, propertyId: string, spaceId: string): string {
  if (!entity?.values) return '';
  const value = entity.values.find(v => v.property.id === propertyId && v.spaceId === spaceId && !v.isDeleted);
  return value?.value ?? '';
}

function dedupePreserveOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  return ids.filter(id => {
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Resolve submitter personal-space ids from the aggregated-ranking relations.
 * Mirrors the block page's `useResolvedRankingSubmitterSpaceIds`: prefer the
 * relation's `to_space`, and for relations that lack one fall back to the rank
 * entity's home space. Without this fallback the "Ranked by" avatars come back
 * empty whenever `to_space` isn't populated even though the count is non-zero.
 */
async function resolveSubmitterSpaceIds(refs: AggregatedRankingSubmitterRef[]): Promise<string[]> {
  const rankEntityIdsNeedingSpace = refs.filter(ref => !ref.spaceId).map(ref => ref.rankEntityId);

  let rankEntitySpaceById = new Map<string, string>();
  if (rankEntityIdsNeedingSpace.length > 0) {
    const { entities } = await Effect.runPromise(
      getAllEntities({ filter: { id: { in: rankEntityIdsNeedingSpace } }, limit: rankEntityIdsNeedingSpace.length })
    );
    rankEntitySpaceById = new Map(
      entities
        .map(entity => [entity.id, entity.spaces?.[0]] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[1]))
    );
  }

  return dedupePreserveOrder(
    refs.map(ref => ref.spaceId ?? rankEntitySpaceById.get(ref.rankEntityId)).filter((id): id is string => Boolean(id))
  );
}

/**
 * Resolve the aggregated leaderboard's top entries (name + thumbnail), in
 * standings order. Best-effort: an entity that fails to resolve still renders,
 * as "Untitled" with no image, so the list keeps its positions.
 */
async function resolveTopEntries(entityIds: string[], spaceId: string): Promise<FeaturedRankingEntry[]> {
  if (entityIds.length === 0) return [];
  const { entities } = await Effect.runPromise(
    getAllEntities({ filter: { id: { in: entityIds } }, spaceId, limit: entityIds.length })
  );
  const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
  return entityIds.map(entityId => {
    const entity = entitiesById.get(entityId);
    return {
      entityId,
      name: entity?.name?.trim() || 'Untitled',
      image: entity ? (Entities.avatar(entity.relations) ?? Entities.cover(entity.relations) ?? null) : null,
    };
  });
}

/**
 * Attach each ranking's space name/image via one batched spaces lookup.
 * Best-effort: on failure the cards render without the space badge rather than
 * dropping the section.
 */
async function attachSpaceMetadata(rankings: FeaturedRanking[]): Promise<FeaturedRanking[]> {
  const spaceIds = dedupePreserveOrder(rankings.map(ranking => ranking.spaceId));
  if (spaceIds.length === 0) return rankings;

  try {
    const spaces = await Effect.runPromise(getSpaces({ spaceIds }));
    const spacesById = new Map(spaces.map(space => [normId(space.id), space]));
    return rankings.map(ranking => {
      const space = spacesById.get(normId(ranking.spaceId));
      if (!space) return ranking;
      return {
        ...ranking,
        spaceName: space.entity.name?.trim() || null,
        spaceImage: space.entity.image ?? null,
      };
    });
  } catch (error) {
    console.error('Unable to resolve featured ranking space metadata', error);
    return rankings;
  }
}

/**
 * Find where a block is embedded: its parent entity id and the id of the BLOCKS
 * relation binding them. The block is the target of a BLOCKS relation from its
 * parent, so we read the block's backlinks. Returns null when the placement
 * can't be resolved — such a ranking is dropped rather than shipping a Vote
 * button that leads to a broken compose view.
 */
async function resolveBlockPlacement(
  blockEntityId: string,
  spaceId: string
): Promise<{ parentEntityId: string; relationId: string } | null> {
  const relations = (await Effect.runPromise(
    getRelationsByToEntityIds([blockEntityId], SystemIds.BLOCKS, spaceId)
  )) as unknown as ToEntityRelation[];
  if (!relations || relations.length === 0) return null;
  const match = relations.find(r => r.spaceId === spaceId) ?? relations[0];
  if (!match.id || !match.fromEntityId) return null;
  return { parentEntityId: match.fromEntityId, relationId: match.id };
}

/**
 * Builds the explore panel's "Featured rankings" list: Ranking Blocks tagged
 * Featured whose voting window is currently open. Each entry is resolved down to
 * the space/block/parent coordinates and the aggregated-submitter data the card
 * needs. Best-effort per ranking — a block that fails to resolve is skipped.
 */
export async function fetchFeaturedRankings(): Promise<FeaturedRanking[]> {
  // 1. Candidate featured ranking blocks (unscoped — we only need id + owning
  //    space here; the scoped values/relations come from the per-block fetch).
  const { entities } = await Effect.runPromise(
    getAllEntities({ filter: FEATURED_RANKINGS_FILTER, limit: MAX_CANDIDATES })
  );

  const seen = new Set<string>();
  const candidates: { blockEntityId: string; spaceId: string }[] = [];
  for (const entity of entities) {
    const spaceId = entity.spaces?.[0];
    if (!spaceId || seen.has(entity.id)) continue;
    seen.add(entity.id);
    candidates.push({ blockEntityId: entity.id, spaceId });
  }

  // 2. Resolve each candidate scoped to its space: date window (for the live
  //    check), aggregated submitters, and parent placement.
  const resolved = await mapWithConcurrency(
    candidates,
    RESOLVE_CONCURRENCY,
    async ({ blockEntityId, spaceId }): Promise<FeaturedRanking | null> => {
      try {
        const page = await Effect.runPromise(getEntityPage(blockEntityId, spaceId));
        if (!page?.entity) return null;

        const entity = page.entity;
        const relations = page.relations.length > 0 ? page.relations : entity.relations;

        const readBlockDate = (propertyId: string) => readDateValue(entity, propertyId, spaceId);
        const rankingStartDate = resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readBlockDate);
        const rankingEndDate = resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readBlockDate);

        // "Live" == voting is currently open (in-progress, or no bounded window).
        const periodState = getRankingPeriodState(rankingStartDate, rankingEndDate);
        if (!rankingSubmissionsOpen(periodState)) return null;

        const placement = await resolveBlockPlacement(blockEntityId, spaceId);
        if (!placement) return null;

        const submitterRefs = getAggregatedRankingSubmitterRefs(relations, blockEntityId, spaceId);
        const submitterSpaceIds = await resolveSubmitterSpaceIds(submitterRefs);

        const orderedEntityIds = getOrderedRelationTargetIds(
          relations,
          blockEntityId,
          RANK_POSITION_PROPERTY_ID,
          spaceId
        ).slice(0, MAX_TOP_ENTRIES);
        const topEntries = await resolveTopEntries(orderedEntityIds, spaceId);

        return {
          blockEntityId,
          spaceId,
          parentEntityId: placement.parentEntityId,
          relationId: placement.relationId,
          name: entity.name?.trim() || 'Untitled ranking',
          rankingStartDate: rankingStartDate.value,
          rankingEndDate: rankingEndDate.value,
          submitterSpaceIds,
          submissionCount: getAggregatedRankingSubmissionCount(relations, blockEntityId, spaceId),
          // Space metadata is attached in one batched lookup after the per-block resolve.
          spaceName: null,
          spaceImage: null,
          topEntries,
        } satisfies FeaturedRanking;
      } catch (error) {
        // Best-effort per ranking: a single block that fails to resolve is skipped
        // rather than failing the whole section, but log it so silently-missing
        // featured rankings stay debuggable in production.
        console.error(`Unable to resolve featured ranking (block ${blockEntityId}, space ${spaceId})`, error);
        return null;
      }
    }
  );

  const rankings = resolved
    .filter((ranking): ranking is FeaturedRanking => ranking !== null)
    .slice(0, MAX_FEATURED_RANKINGS);

  return attachSpaceMetadata(rankings);
}
