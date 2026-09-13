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
import { MAX_FEATURED_RANKING_ENTRIES } from '~/core/explore/featured-rankings-config';
import type { EntityFilter } from '~/core/gql/graphql';
import { getAllEntities, getBatchEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import { RANKING_BLOCK_TYPE_ID, RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import { reportError } from '~/core/telemetry/logger';
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
  /** Current aggregated leaderboard, best first — the card pages through it in fives. */
  topEntries: FeaturedRankingEntry[];
}

// Pull a small window of candidates, then keep only the live ones. A handful of
// featured rankings is expected, so these caps are comfortably above real usage
// while bounding SSR cost.
const MAX_CANDIDATES = 25;
const MAX_FEATURED_RANKINGS = 10;

/**
 * How many per-space queries are in flight at once.
 *
 * Batching replaced a four-query chain per ranking with a handful of per-space queries, which
 * removed the need to bound *rankings* — but not the need to bound *spaces*. `MAX_CANDIDATES`
 * rankings can span that many distinct spaces, and both the block-entity and leaderboard phases
 * issue one query per space, so an unbounded fan-out here would put ~25 of them in flight at once
 * and then do it again for the leaderboards.
 *
 * Matches `ENTITY_ID_BATCH_CONCURRENCY` in `core/io/queries.ts` deliberately: these are the same
 * kind of query it bounds, for the same stated reason — each pulls every value and relation for
 * its entities, so firing twenty at once trades a queue we control for one we do not.
 */
const SPACE_QUERY_CONCURRENCY = 6;

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
async function resolveSubmitterSpaceIdsByBlock(
  refsByBlock: Map<string, AggregatedRankingSubmitterRef[]>
): Promise<Map<string, string[]>> {
  const idsNeedingSpace = new Set<string>();
  for (const refs of refsByBlock.values()) {
    for (const ref of refs) {
      if (!ref.spaceId) idsNeedingSpace.add(ref.rankEntityId);
    }
  }

  let rankEntitySpaceById = new Map<string, string>();
  if (idsNeedingSpace.size > 0) {
    try {
      const ids = [...idsNeedingSpace];
      const { entities } = await Effect.runPromise(getAllEntities({ filter: { id: { in: ids } }, limit: ids.length }));
      rankEntitySpaceById = new Map(
        entities
          .map(entity => [entity.id, entity.spaces?.[0]] as const)
          .filter((entry): entry is [string, string] => Boolean(entry[1]))
      );
    } catch (error) {
      // Best-effort, and deliberately softer than the per-ranking version this replaces: that one
      // let the failure reach the per-ranking catch, which dropped the ranking. One shared batch
      // failing that way would now drop *every* featured ranking, so instead the fallback is
      // skipped and the affected cards render with the submitter avatars they could resolve.
      //
      // Reported rather than only logged, because that degradation is invisible: the old failure
      // removed a card, which someone would eventually notice and report; fewer "Ranked by"
      // avatars is not something anyone will. Without this the only trace is a server log nobody
      // has a reason to read.
      reportError(error);
      console.error('Unable to resolve featured ranking submitter home spaces', error);
    }
  }

  const byBlock = new Map<string, string[]>();
  for (const [blockEntityId, refs] of refsByBlock) {
    byBlock.set(
      blockEntityId,
      dedupePreserveOrder(
        refs.map(ref => ref.spaceId ?? rankEntitySpaceById.get(ref.rankEntityId)).filter((id): id is string => Boolean(id))
      )
    );
  }
  return byBlock;
}

/**
 * Resolve the aggregated leaderboard's top entries (name + thumbnail), in
 * standings order. Best-effort twice over: an entity missing from the response
 * still renders (as "Untitled" with no image) so the list keeps its positions,
 * and a failed lookup yields an empty list so the ranking card still renders
 * without its leaderboard instead of being dropped by the per-ranking catch.
 */
async function resolveTopEntriesByBlock(
  requests: { blockEntityId: string; spaceId: string; entityIds: string[] }[]
): Promise<Map<string, FeaturedRankingEntry[]>> {
  const byBlock = new Map<string, FeaturedRankingEntry[]>();
  const withEntries = requests.filter(request => request.entityIds.length > 0);
  for (const request of requests) byBlock.set(request.blockEntityId, []);
  if (withEntries.length === 0) return byBlock;

  // The batch query scopes values and relations to a single space, so rankings are grouped by
  // their own space rather than merged into one call. Distinct spaces, not rankings, set the
  // query count.
  const bySpace = new Map<string, typeof withEntries>();
  for (const request of withEntries) {
    const group = bySpace.get(request.spaceId) ?? [];
    group.push(request);
    bySpace.set(request.spaceId, group);
  }

  await mapWithConcurrency(
    [...bySpace.entries()],
    SPACE_QUERY_CONCURRENCY,
    async ([spaceId, group]) => {
      const ids = dedupePreserveOrder(group.flatMap(request => request.entityIds));
      try {
        const { entities } = await Effect.runPromise(
          getAllEntities({ filter: { id: { in: ids } }, spaceId, limit: ids.length })
        );
        const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
        for (const request of group) {
          byBlock.set(
            request.blockEntityId,
            // Kept per ranking and in its own order: an entity missing from the response still
            // renders as "Untitled" so the leaderboard keeps its positions.
            request.entityIds.map(entityId => {
              const entity = entitiesById.get(entityId);
              return {
                entityId,
                name: entity?.name?.trim() || 'Untitled',
                image: entity ? (Entities.avatar(entity.relations) ?? Entities.cover(entity.relations) ?? null) : null,
              };
            })
          );
        }
      } catch (error) {
        // Scoped to the one space that failed: its rankings keep the empty leaderboard they were
        // seeded with above and still render, exactly as the per-ranking version did. Reported
        // for the same reason as above — silent before, and now one failure covers every ranking
        // in the space rather than one card.
        reportError(error);
        console.error(`Unable to resolve featured ranking top entries (space ${spaceId})`, error);
      }
    }
  );

  return byBlock;
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
async function resolveBlockPlacements(
  blocks: { blockEntityId: string; spaceId: string }[]
): Promise<Map<string, { parentEntityId: string; relationId: string }>> {
  const placements = new Map<string, { parentEntityId: string; relationId: string }>();
  if (blocks.length === 0) return placements;

  let relations: ToEntityRelation[] = [];
  try {
    // `spaceId` is omitted so every block resolves in one query rather than one per space. That
    // widens the result to all spaces, so each block's own space is applied below — verified
    // against the API to be a strict superset of the per-block, per-space responses.
    relations = (await Effect.runPromise(
      getRelationsByToEntityIds(
        blocks.map(block => block.blockEntityId),
        SystemIds.BLOCKS
      )
    )) as unknown as ToEntityRelation[];
  } catch (error) {
    // Every ranking needs a placement, so a failure here drops them all — same as the per-block
    // version, where the throw reached each ranking's own catch. Reported because an empty
    // Featured rankings section is the hardest of these to trace back to a cause.
    reportError(error);
    console.error('Unable to resolve featured ranking block placements', error);
    return placements;
  }

  const byBlock = new Map<string, ToEntityRelation[]>();
  for (const relation of relations ?? []) {
    const group = byBlock.get(relation.toEntityId) ?? [];
    group.push(relation);
    byBlock.set(relation.toEntityId, group);
  }

  for (const { blockEntityId, spaceId } of blocks) {
    // Narrow to the block's own space first. The per-block query was already space-filtered, so
    // its `find(spaceId) ?? [0]` could only ever return a relation from that space; picking the
    // first of the scoped group here is the same choice.
    const match = (byBlock.get(blockEntityId) ?? []).find(relation => relation.spaceId === spaceId);
    if (!match?.id || !match.fromEntityId) continue;
    placements.set(blockEntityId, { parentEntityId: match.fromEntityId, relationId: match.id });
  }

  return placements;
}

/**
 * Builds the explore panel's "Featured rankings" list: Ranking Blocks tagged
 * Featured whose voting window is currently open. Each entry is resolved down to
 * the space/block/parent coordinates and the aggregated-submitter data the card
 * needs. Best-effort per ranking — a block that fails to resolve is skipped.
 */
export async function fetchFeaturedRankings(): Promise<FeaturedRanking[]> {
  // 1. Candidate featured ranking blocks (unscoped — we only need id + owning
  //    space here; the scoped values/relations come from the batched fetch below).
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
  if (candidates.length === 0) return [];

  // 2. Block entities, space-scoped, one query per distinct space rather than one per block.
  const candidatesBySpace = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const group = candidatesBySpace.get(candidate.spaceId) ?? [];
    group.push(candidate);
    candidatesBySpace.set(candidate.spaceId, group);
  }

  const blockEntities = new Map<string, Entity>();
  await mapWithConcurrency(
    [...candidatesBySpace.entries()],
    SPACE_QUERY_CONCURRENCY,
    async ([spaceId, group]) => {
      try {
        const resolvedEntities = await Effect.runPromise(
          getBatchEntities(
            group.map(candidate => candidate.blockEntityId),
            spaceId
          )
        );
        for (const entity of resolvedEntities) blockEntities.set(entity.id, entity);
      } catch (error) {
        // Scoped to the one space that failed — its rankings drop out below for want of an
        // entity, the rest are unaffected. Reported because batching widened the blast radius
        // from the single block the per-block fetch would have dropped.
        reportError(error);
        console.error(`Unable to resolve featured ranking blocks (space ${spaceId})`, error);
      }
    }
  );

  // 3. Keep the live ones. Pure reads of what phase 2 returned, so this costs no requests and
  //    still runs before the expensive work, as the per-block version did.
  const live: {
    blockEntityId: string;
    spaceId: string;
    entity: Entity;
    relations: Entity['relations'];
    rankingStartDate: { value: string };
    rankingEndDate: { value: string };
  }[] = [];

  for (const { blockEntityId, spaceId } of candidates) {
    const entity = blockEntities.get(blockEntityId);
    if (!entity) continue;

    const readBlockDate = (propertyId: string) => readDateValue(entity, propertyId, spaceId);
    const rankingStartDate = resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readBlockDate);
    const rankingEndDate = resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readBlockDate);

    // "Live" == voting is currently open (in-progress, or no bounded window).
    const periodState = getRankingPeriodState(rankingStartDate, rankingEndDate);
    if (!rankingSubmissionsOpen(periodState)) continue;

    live.push({ blockEntityId, spaceId, entity, relations: entity.relations, rankingStartDate, rankingEndDate });
  }

  if (live.length === 0) return [];

  // 4. Placement, submitter spaces and leaderboards. Each depends only on phase 2, not on each
  //    other, so they overlap instead of running as the three sequential steps they used to be.
  const submitterRefsByBlock = new Map<string, AggregatedRankingSubmitterRef[]>();
  const topEntryRequests: { blockEntityId: string; spaceId: string; entityIds: string[] }[] = [];
  for (const { blockEntityId, spaceId, relations } of live) {
    submitterRefsByBlock.set(blockEntityId, getAggregatedRankingSubmitterRefs(relations, blockEntityId, spaceId));
    topEntryRequests.push({
      blockEntityId,
      spaceId,
      entityIds: getOrderedRelationTargetIds(relations, blockEntityId, RANK_POSITION_PROPERTY_ID, spaceId).slice(
        0,
        MAX_FEATURED_RANKING_ENTRIES
      ),
    });
  }

  const [placements, submitterSpaceIdsByBlock, topEntriesByBlock] = await Promise.all([
    resolveBlockPlacements(live.map(({ blockEntityId, spaceId }) => ({ blockEntityId, spaceId }))),
    resolveSubmitterSpaceIdsByBlock(submitterRefsByBlock),
    resolveTopEntriesByBlock(topEntryRequests),
  ]);

  // 5. Assemble in candidate order, then cap. The cap stays here rather than moving before the
  //    resolve: batching made resolving the extras almost free (it adds ids to existing queries,
  //    not queries), and capping early would shrink the list below the cap whenever a ranking
  //    failed to resolve, instead of the next one taking its place.
  const rankings: FeaturedRanking[] = [];
  for (const { blockEntityId, spaceId, entity, relations, rankingStartDate, rankingEndDate } of live) {
    const placement = placements.get(blockEntityId);
    if (!placement) continue;

    rankings.push({
      blockEntityId,
      spaceId,
      parentEntityId: placement.parentEntityId,
      relationId: placement.relationId,
      name: entity.name?.trim() || 'Untitled ranking',
      rankingStartDate: rankingStartDate.value,
      rankingEndDate: rankingEndDate.value,
      submitterSpaceIds: submitterSpaceIdsByBlock.get(blockEntityId) ?? [],
      submissionCount: getAggregatedRankingSubmissionCount(relations, blockEntityId, spaceId),
      // Space metadata is attached in one batched lookup after the per-block resolve.
      spaceName: null,
      spaceImage: null,
      topEntries: topEntriesByBlock.get(blockEntityId) ?? [],
    } satisfies FeaturedRanking);

    if (rankings.length === MAX_FEATURED_RANKINGS) break;
  }

  return attachSpaceMetadata(rankings);
}
