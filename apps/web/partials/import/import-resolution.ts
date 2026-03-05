import { Effect } from 'effect';

import { ROOT_SPACE } from '~/core/constants';
import { ID } from '~/core/id';
import { getRelationsByToEntityIds, getResults } from '~/core/io/queries';
import { SearchResult } from '~/core/types';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { RelationPropertyMeta, ResolvedEntity } from './import-generation';

type ResolutionGuard = {
  isCurrent: () => boolean;
};

type ResolvedEntityMatch =
  | { status: 'resolved'; entity: { id: string; name: string } }
  | { status: 'unresolved'; reason: 'none' | 'tie' | 'ambiguous' };

async function resolveExactRelationMatch(params: {
  name: string;
  typeIds: string[];
  guard: ResolutionGuard;
}): Promise<ResolvedEntityMatch> {
  const { name, typeIds, guard } = params;
  const normalizedName = name.trim().toLowerCase();

  const results = await Effect.runPromise(
    getResults({
      query: name,
      typeIds: typeIds.length > 0 ? typeIds : undefined,
    })
  );
  if (!guard.isCurrent()) return { status: 'unresolved', reason: 'ambiguous' };

  const exactMatches = results.filter(result => {
    const matchesName = (result.name ?? '').trim().toLowerCase() === normalizedName;
    if (!matchesName) return false;
    if (typeIds.length === 0) return true;
    return result.types.some(t => typeIds.includes(t.id));
  });

  if (exactMatches.length === 0) {
    return { status: 'unresolved', reason: 'none' };
  }
  if (exactMatches.length > 1) {
    return { status: 'unresolved', reason: 'tie' };
  }

  const match = exactMatches[0];
  return {
    status: 'resolved',
    entity: { id: match.id, name: match.name ?? name },
  };
}

function getCandidateSpaceForRanking(candidate: SearchResult, currentSpaceId: string): { tier: 0 | 1 | 2; spaceId: string | null } {
  const spaceIds = candidate.spaces.map(s => s.spaceId);
  if (spaceIds.includes(currentSpaceId)) {
    return { tier: 0, spaceId: currentSpaceId };
  }
  if (spaceIds.includes(ROOT_SPACE)) {
    return { tier: 1, spaceId: ROOT_SPACE };
  }
  return { tier: 2, spaceId: spaceIds[0] ?? null };
}

function getSpaceBucketRank(spaceId: string | null, tier: 0 | 1 | 2): number {
  if (!spaceId) return Number.MAX_SAFE_INTEGER;
  if (tier === 0) return 0;
  if (tier === 1) return 1;
  return 2 + getSpaceRank(spaceId);
}

async function resolveBestEntityMatch(params: {
  name: string;
  typeIds: string[];
  currentSpaceId: string;
  guard: ResolutionGuard;
}): Promise<ResolvedEntityMatch> {
  const { name, typeIds, currentSpaceId, guard } = params;
  const normalizedName = name.trim().toLowerCase();

  const results = await Effect.runPromise(
    getResults({
      query: name,
      typeIds,
    })
  );

  if (!guard.isCurrent()) return { status: 'unresolved', reason: 'ambiguous' };

  const exactMatches = results.filter(result => {
    const matchesName = (result.name ?? '').trim().toLowerCase() === normalizedName;
    const matchesType = result.types.some(t => typeIds.includes(t.id));
    return matchesName && matchesType;
  });

  if (exactMatches.length === 0) {
    return { status: 'unresolved', reason: 'none' };
  }

  const withSpaceRank = exactMatches.map(candidate => {
    const rankedSpace = getCandidateSpaceForRanking(candidate, currentSpaceId);
    return {
      candidate,
      rankedSpace,
      bucketRank: getSpaceBucketRank(rankedSpace.spaceId, rankedSpace.tier),
    };
  });

  const bestBucketRank = Math.min(...withSpaceRank.map(c => c.bucketRank));
  const inBestBucket = withSpaceRank.filter(c => c.bucketRank === bestBucketRank);

  const bestSpaceId = inBestBucket[0]?.rankedSpace.spaceId ?? null;
  const inBestSpace = inBestBucket.filter(c => c.rankedSpace.spaceId === bestSpaceId);

  if (inBestSpace.length === 1) {
    const only = inBestSpace[0].candidate;
    return { status: 'resolved', entity: { id: only.id, name: only.name ?? name } };
  }

  const backlinks = await Effect.runPromise(
    getRelationsByToEntityIds(
      inBestSpace.map(c => c.candidate.id),
      undefined,
      bestSpaceId ?? undefined
    )
  );
  if (!guard.isCurrent()) return { status: 'unresolved', reason: 'ambiguous' };

  const backlinksByEntityId = new Map<string, number>();
  for (const relation of backlinks) {
    backlinksByEntityId.set(relation.toEntityId, (backlinksByEntityId.get(relation.toEntityId) ?? 0) + 1);
  }

  let winner: (typeof inBestSpace)[number] | null = null;
  let winnerCount = -1;
  let hasTie = false;

  for (const candidate of inBestSpace) {
    const count = backlinksByEntityId.get(candidate.candidate.id) ?? 0;
    if (count > winnerCount) {
      winner = candidate;
      winnerCount = count;
      hasTie = false;
    } else if (count === winnerCount) {
      hasTie = true;
    }
  }

  if (!winner || hasTie) {
    return { status: 'unresolved', reason: 'tie' };
  }

  return {
    status: 'resolved',
    entity: {
      id: winner.candidate.id,
      name: winner.candidate.name ?? name,
    },
  };
}

export async function resolveRelationEntities(params: {
  relationProperties: RelationPropertyMeta[];
  guard: ResolutionGuard;
}): Promise<{
  aborted: boolean;
  resolvedEntities: Map<string, ResolvedEntity>;
  unresolvedCount: number;
}> {
  const { relationProperties, guard } = params;

  const resolvedEntities = new Map<string, ResolvedEntity>();
  let unresolvedCount = 0;

  for (const relationProperty of relationProperties) {
    for (const cellValue of relationProperty.uniqueCellValues) {
      const cacheKey = `${relationProperty.propertyId}::${cellValue}`;
      const relationTypeIds = relationProperty.typeIds;

      try {
        const match = await resolveExactRelationMatch({
          name: cellValue,
          typeIds: relationTypeIds,
          guard,
        });
        if (!guard.isCurrent()) {
          return { aborted: true, resolvedEntities, unresolvedCount };
        }

        if (match.status === 'resolved') {
          resolvedEntities.set(cacheKey, {
            id: match.entity.id,
            name: match.entity.name,
            status: 'found',
          });
        } else {
          if (match.reason === 'none') {
            resolvedEntities.set(cacheKey, {
              id: ID.createEntityId(),
              name: cellValue,
              status: 'created',
            });
          } else {
            unresolvedCount += 1;
            resolvedEntities.set(cacheKey, { status: 'ambiguous' });
          }
        }
      } catch (error) {
        console.warn(
          `[import] Failed to resolve relation value "${cellValue}" for property ${relationProperty.propertyId}`,
          error
        );
      }
    }
  }

  return { aborted: false, resolvedEntities, unresolvedCount };
}

export async function resolveTypesForRows(params: {
  dataRows: string[][];
  typesColumnIndex: number | undefined;
  spaceId: string;
  guard: ResolutionGuard;
}): Promise<{ aborted: boolean; resolvedTypes: Map<string, { id: string; name: string }> }> {
  const { dataRows, typesColumnIndex, spaceId, guard } = params;
  const resolvedTypes = new Map<string, { id: string; name: string }>();

  if (typesColumnIndex === undefined) {
    return { aborted: false, resolvedTypes };
  }

  const uniqueTypeNames = new Set<string>();
  for (const row of dataRows) {
    const raw = (row[typesColumnIndex] ?? '').trim();
    if (raw) uniqueTypeNames.add(raw);
  }

  for (const typeName of uniqueTypeNames) {
    try {
      const results = await Effect.runPromise(getResults({ query: typeName, spaceId }));
      if (!guard.isCurrent()) return { aborted: true, resolvedTypes };

      const exactMatches = results.filter(r => (r.name ?? '').trim().toLowerCase() === typeName.toLowerCase());
      if (exactMatches.length === 1) {
        resolvedTypes.set(typeName, { id: exactMatches[0].id, name: exactMatches[0].name ?? typeName });
      }
    } catch (error) {
      console.warn(`[import] Failed to resolve type "${typeName}"`, error);
    }
  }

  return { aborted: false, resolvedTypes };
}

export async function resolveRowsByNameAndType(params: {
  dataRows: string[][];
  nameColIdx: number;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string }>;
  spaceId: string;
  guard: ResolutionGuard;
}): Promise<{
  aborted: boolean;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  unresolvedRowCount: number;
}> {
  const { dataRows, nameColIdx, selectedType, typesColumnIndex, resolvedTypes, spaceId, guard } = params;
  const resolvedRows = new Map<number, { entityId: string; name: string }>();
  let unresolvedRowCount = 0;

  const cache = new Map<string, { status: 'resolved'; entityId: string; name: string } | { status: 'unresolved' }>();

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    const rowName = (row[nameColIdx] ?? '').trim();
    if (!rowName) {
      unresolvedRowCount += 1;
      continue;
    }

    let rowTypeId: string | null = selectedType?.id ?? null;
    if (typesColumnIndex !== undefined) {
      const rawType = (row[typesColumnIndex] ?? '').trim();
      rowTypeId = rawType ? (resolvedTypes.get(rawType)?.id ?? null) : null;
    }

    if (!rowTypeId) {
      unresolvedRowCount += 1;
      continue;
    }

    const cacheKey = `${rowTypeId}::${rowName.toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      if (cached.status === 'resolved') {
        resolvedRows.set(rowIndex, { entityId: cached.entityId, name: cached.name });
      } else {
        unresolvedRowCount += 1;
      }
      continue;
    }

    const match = await resolveBestEntityMatch({
      name: rowName,
      typeIds: [rowTypeId],
      currentSpaceId: spaceId,
      guard,
    });
    if (!guard.isCurrent()) {
      return { aborted: true, resolvedRows, unresolvedRowCount };
    }

    if (match.status === 'resolved') {
      cache.set(cacheKey, { status: 'resolved', entityId: match.entity.id, name: match.entity.name });
      resolvedRows.set(rowIndex, { entityId: match.entity.id, name: match.entity.name });
    } else {
      if (match.reason === 'none') {
        const createdEntityId = ID.createEntityId();
        cache.set(cacheKey, { status: 'resolved', entityId: createdEntityId, name: rowName });
        resolvedRows.set(rowIndex, { entityId: createdEntityId, name: rowName });
      } else {
        cache.set(cacheKey, { status: 'unresolved' });
        unresolvedRowCount += 1;
      }
    }
  }

  return { aborted: false, resolvedRows, unresolvedRowCount };
}
