import { Effect } from 'effect';

import { ID } from '~/core/id';
import { getRelationsByToEntityIds, getResults } from '~/core/io/queries';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { RelationPropertyMeta, ResolvedEntity } from './import-generation';

type ResolutionGuard = {
  isCurrent: () => boolean;
};

type ResolvedEntityMatch =
  | { status: 'resolved'; entity: { id: string; name: string }; ranked?: boolean }
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
    // Rank by best space and pick the winner if unique at the top rank
    const ranked = exactMatches.map(m => ({
      match: m,
      rank: getCandidateTopSpaceRank(m.spaces.map(s => s.spaceId)),
    }));
    const bestRank = Math.min(...ranked.map(r => r.rank));
    const atBest = ranked.filter(r => r.rank === bestRank);

    if (atBest.length === 1) {
      const winner = atBest[0].match;
      return { status: 'resolved', entity: { id: winner.id, name: winner.name ?? name }, ranked: true };
    }

    return { status: 'unresolved', reason: 'tie' };
  }

  const match = exactMatches[0];
  return {
    status: 'resolved',
    entity: { id: match.id, name: match.name ?? name },
  };
}

function getCandidateTopSpaceRank(spaceIds: string[]): number {
  if (spaceIds.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...spaceIds.map(getSpaceRank));
}

async function resolveBestEntityMatch(params: {
  name: string;
  typeIds: string[];
  guard: ResolutionGuard;
}): Promise<ResolvedEntityMatch> {
  const { name, typeIds, guard } = params;
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
    return {
      candidate,
      spaceRank: getCandidateTopSpaceRank(candidate.spaces.map(s => s.spaceId)),
    };
  });

  const bestSpaceRank = Math.min(...withSpaceRank.map(c => c.spaceRank));
  const inBestRank = withSpaceRank.filter(c => c.spaceRank === bestSpaceRank);

  if (inBestRank.length === 1) {
    const only = inBestRank[0].candidate;
    return { status: 'resolved', entity: { id: only.id, name: only.name ?? name } };
  }

  const backlinks = await Effect.runPromise(
    getRelationsByToEntityIds(
      inBestRank.map(c => c.candidate.id),
      undefined
    )
  );
  if (!guard.isCurrent()) return { status: 'unresolved', reason: 'ambiguous' };

  const backlinksByEntityId = new Map<string, number>();
  for (const relation of backlinks) {
    backlinksByEntityId.set(relation.toEntityId, (backlinksByEntityId.get(relation.toEntityId) ?? 0) + 1);
  }

  let winner: (typeof inBestRank)[number] | null = null;
  let winnerCount = -1;

  for (const candidate of inBestRank) {
    const count = backlinksByEntityId.get(candidate.candidate.id) ?? 0;
    if (count > winnerCount) {
      winner = candidate;
      winnerCount = count;
    }
  }

  if (!winner) {
    return { status: 'unresolved', reason: 'ambiguous' };
  }

  // Deterministic fallback in backlink ties: smallest entity id wins.
  const tied = inBestRank.filter(
    candidate => (backlinksByEntityId.get(candidate.candidate.id) ?? 0) === winnerCount
  );
  if (tied.length > 1) {
    winner = tied.sort((a, b) => a.candidate.id.localeCompare(b.candidate.id))[0];
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

  // Flatten all (property, cellValue) pairs and resolve in parallel
  const pairs = relationProperties.flatMap(rp =>
    Array.from(rp.uniqueCellValues).map(cellValue => ({
      cacheKey: `${rp.propertyId}::${cellValue}`,
      cellValue,
      typeIds: rp.typeIds,
      propertyId: rp.propertyId,
    }))
  );

  const results = await Promise.all(
    pairs.map(async ({ cacheKey, cellValue, typeIds, propertyId }) => {
      try {
        const match = await resolveExactRelationMatch({
          name: cellValue,
          typeIds,
          guard,
        });
        return { cacheKey, cellValue, match, typeIds };
      } catch (error) {
        console.warn(
          `[import] Failed to resolve relation value "${cellValue}" for property ${propertyId}`,
          error
        );
        return null;
      }
    })
  );

  if (!guard.isCurrent()) {
    return { aborted: true, resolvedEntities, unresolvedCount };
  }

  // Build a lookup for type names so auto-created entities can include typeName
  const typeNameById = new Map<string, string | null>();
  for (const rp of relationProperties) {
    for (const vt of rp.property.relationValueTypes ?? []) {
      if (!typeNameById.has(vt.id)) {
        typeNameById.set(vt.id, vt.name ?? null);
      }
    }
  }

  for (const result of results) {
    if (!result) continue;
    const { cacheKey, cellValue, match, typeIds } = result;

    if (match.status === 'resolved') {
      resolvedEntities.set(cacheKey, {
        id: match.entity.id,
        name: match.entity.name,
        status: match.ranked ? 'ranked' : 'found',
      });
    } else {
      if (match.reason === 'none') {
        const firstTypeId = typeIds[0];
        resolvedEntities.set(cacheKey, {
          id: ID.createEntityId(),
          name: cellValue,
          status: 'created',
          typeId: firstTypeId,
          typeName: firstTypeId ? typeNameById.get(firstTypeId) ?? null : undefined,
        });
      } else {
        unresolvedCount += 1;
        resolvedEntities.set(cacheKey, { status: 'ambiguous' });
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

  await Promise.all(
    Array.from(uniqueTypeNames).map(async typeName => {
      try {
        const results = await Effect.runPromise(getResults({ query: typeName, spaceId }));
        const exactMatches = results.filter(r => (r.name ?? '').trim().toLowerCase() === typeName.toLowerCase());
        if (exactMatches.length === 1) {
          resolvedTypes.set(typeName, { id: exactMatches[0].id, name: exactMatches[0].name ?? typeName });
        }
      } catch (error) {
        console.warn(`[import] Failed to resolve type "${typeName}"`, error);
      }
    })
  );

  if (!guard.isCurrent()) return { aborted: true, resolvedTypes };

  return { aborted: false, resolvedTypes };
}

export async function resolveRowsByNameAndType(params: {
  dataRows: string[][];
  nameColIdx: number;
  selectedType: { id: string; name: string | null } | null;
  typesColumnIndex: number | undefined;
  resolvedTypes: Map<string, { id: string; name: string }>;
  guard: ResolutionGuard;
}): Promise<{
  aborted: boolean;
  resolvedRows: Map<number, { entityId: string; name: string; ranked?: boolean }>;
  unresolvedRowCount: number;
}> {
  const { dataRows, nameColIdx, selectedType, typesColumnIndex, resolvedTypes, guard } = params;
  const resolvedRows = new Map<number, { entityId: string; name: string; ranked?: boolean }>();
  let unresolvedRowCount = 0;

  const cache = new Map<string, { status: 'resolved'; entityId: string; name: string; ranked?: boolean } | { status: 'unresolved' }>();

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
        resolvedRows.set(rowIndex, { entityId: cached.entityId, name: cached.name, ranked: cached.ranked });
      } else {
        unresolvedRowCount += 1;
      }
      continue;
    }

    const match = await resolveExactRelationMatch({
      name: rowName,
      typeIds: [rowTypeId],
      guard,
    });
    if (!guard.isCurrent()) {
      return { aborted: true, resolvedRows, unresolvedRowCount };
    }

    if (match.status === 'resolved') {
      cache.set(cacheKey, { status: 'resolved', entityId: match.entity.id, name: match.entity.name, ranked: match.ranked });
      resolvedRows.set(rowIndex, { entityId: match.entity.id, name: match.entity.name, ranked: match.ranked });
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
