import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { uuidToHex } from '~/core/id/normalize';
import type { Space } from '~/core/io/dto/spaces';
import { ENTITY_ID_BATCH_SIZE, getAllEntities, getRelationsByToEntityIds, getSpaces } from '~/core/io/queries';
import type { Entity } from '~/core/types';

import { buildBounty } from './bounty-dto';
import { difficultyLabelForId, statusKeyForId, statusLabelForKey } from './labels';
import {
  BOUNTY_ALLOCATED_PROPERTY_ID,
  BOUNTY_DIFFICULTY_PROPERTY_ID,
  BOUNTY_MAINTAINER_PROPERTY_ID,
  BOUNTY_SKILLS_PROPERTY_ID,
  BOUNTY_SUBMISSION_PROPERTY_ID,
  BOUNTY_TASK_STATUS_PROPERTY_ID,
  BOUNTY_TYPE_ID,
  INTERESTED_IN_BOUNTY_PROPERTY_ID,
} from './ontology';
import type { BoardBounty } from './types';

/**
 * Read layer for the bounty board. One entities query (multi-space, typed,
 * auto-paginated by getAllEntities) returns each bounty with its values and
 * relations embedded, so difficulty/status/skills/allocation need no
 * per-bounty fan-out. Space labels and the two backlink counts (interest,
 * submissions) are batched afterwards.
 */

export function bountySpaceFallbackLabel(spaceId: string): string {
  const compact = spaceId.replace(/-/g, '');
  return compact.length > 14 ? `${compact.slice(0, 6)}…${compact.slice(-4)}` : spaceId;
}

export type SpaceRow = { id: string; label: string; image: string };

export function spaceRowsById(spaces: readonly Space[], spaceIds: readonly string[]): Map<string, SpaceRow> {
  const byId = new Map(spaces.map(space => [uuidToHex(space.id), space]));
  const rows = new Map<string, SpaceRow>();
  for (const id of spaceIds) {
    const found = byId.get(uuidToHex(id));
    const name = found?.entity?.name?.trim();
    rows.set(id, {
      id,
      label: name && name.length > 0 ? name : bountySpaceFallbackLabel(id),
      image: found?.entity?.image && found.entity.image.length > 0 ? found.entity.image : PLACEHOLDER_SPACE_IMAGE,
    });
  }
  return rows;
}

function relationTargets(entity: Entity, typeId: string): { id: string; name: string | null }[] {
  return entity.relations
    .filter(relation => relation.type.id === typeId)
    .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name }))
    .filter(target => !!target.id);
}

/** Pure: an API entity → BoardBounty (space labels and counts are attached separately). */
export function toBoardBounty(entity: Entity, fallbackSpaceId: string): BoardBounty {
  const spaceId = entity.spaces?.[0] ?? fallbackSpaceId;
  const base = buildBounty(entity.id, entity.values ?? [], entity.relations ?? [], new Map(), new Map(), spaceId);

  const difficultyId = relationTargets(entity, BOUNTY_DIFFICULTY_PROPERTY_ID)[0]?.id ?? null;
  const statusId = relationTargets(entity, BOUNTY_TASK_STATUS_PROPERTY_ID)[0]?.id ?? null;
  const updatedAtRaw = entity.updatedAt;
  const updatedAt =
    typeof updatedAtRaw === 'number'
      ? new Date(updatedAtRaw * 1000).toISOString()
      : typeof updatedAtRaw === 'string' && /^\d+$/.test(updatedAtRaw)
        ? new Date(Number(updatedAtRaw) * 1000).toISOString()
        : (updatedAtRaw ?? null);

  return {
    ...base,
    spaceId,
    // Prefer the closed-set labels; fall back to whatever name the relation carried.
    difficulty: difficultyLabelForId(difficultyId) ?? base.difficulty,
    status: statusLabelForKey(statusKeyForId(statusId)),
    difficultyId,
    statusId,
    skills: relationTargets(entity, BOUNTY_SKILLS_PROPERTY_ID).map(skill => ({
      id: skill.id,
      name: skill.name?.trim() || 'Untitled skill',
    })),
    maintainers: relationTargets(entity, BOUNTY_MAINTAINER_PROPERTY_ID),
    allocatedIds: relationTargets(entity, BOUNTY_ALLOCATED_PROPERTY_ID).map(target => target.id),
    interestedCount: 0,
    updatedAt,
  };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Counts backlink relations of `typeId` per target entity, batching ids under the API's per-request cap. */
export function countBacklinks(entityIds: readonly string[], typeId: string) {
  return Effect.gen(function* () {
    const counts = new Map<string, number>();
    if (entityIds.length === 0) return counts;
    const pages = yield* Effect.all(
      chunk(entityIds, ENTITY_ID_BATCH_SIZE).map(ids => getRelationsByToEntityIds(ids, typeId)),
      { concurrency: 4 }
    );
    for (const relations of pages) {
      for (const relation of relations) {
        const key = uuidToHex(relation.toEntityId);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  });
}

export type BoardData = {
  bounties: BoardBounty[];
  spaces: SpaceRow[];
};

/**
 * Loads every bounty in the given spaces, labelled and counted, ready for
 * client-side filtering. `spaceIds` is the participating-space allow-list (or
 * a single space for the space tab).
 */
export function fetchBoardBounties(spaceIds: readonly string[]) {
  return Effect.gen(function* () {
    if (spaceIds.length === 0) return { bounties: [], spaces: [] } satisfies BoardData;

    const [page, spaces] = yield* Effect.all(
      [
        getAllEntities({ spaceIds: { in: [...spaceIds] }, typeIds: { is: BOUNTY_TYPE_ID } }),
        getSpaces({ spaceIds: [...spaceIds] }),
      ],
      { concurrency: 2 }
    );

    const rows = spaceRowsById(spaces, spaceIds);
    const bounties = page.entities.map(entity => toBoardBounty(entity, spaceIds[0]));
    const bountyIds = bounties.map(bounty => bounty.id);

    const [interestCounts, submissionCounts] = yield* Effect.all(
      [
        countBacklinks(bountyIds, INTERESTED_IN_BOUNTY_PROPERTY_ID),
        countBacklinks(bountyIds, BOUNTY_SUBMISSION_PROPERTY_ID),
      ],
      { concurrency: 2 }
    );

    for (const bounty of bounties) {
      const row = rows.get(bounty.spaceId);
      bounty.spaceLabel = row?.label ?? bountySpaceFallbackLabel(bounty.spaceId);
      bounty.spaceImage = row?.image ?? PLACEHOLDER_SPACE_IMAGE;
      bounty.interestedCount = interestCounts.get(uuidToHex(bounty.id)) ?? 0;
      bounty.submissionsCount = submissionCounts.get(uuidToHex(bounty.id)) ?? 0;
    }

    return { bounties, spaces: spaceIds.map(id => rows.get(id)!) } satisfies BoardData;
  });
}
