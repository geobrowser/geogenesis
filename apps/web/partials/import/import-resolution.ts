import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect } from 'effect';

import { ID } from '~/core/id';
import { type NameValueMatch, getNameValuesBatch } from '~/core/io/queries';
import { getSpaceRank } from '~/core/utils/space/space-ranking';

import { RelationPropertyMeta, ResolvedEntity } from './import-generation';

const DEBUG_IMPORT = process.env.NODE_ENV === 'development';
const REQUEST_TIMEOUT_MS = 120_000;

/** Names per batch request to the values endpoint. */
const BATCH_SIZE = 200;

/** Max concurrent batch requests per round. */
const BATCH_CONCURRENCY = 4;

/** Yield to the browser so scroll/paint/input events can be processed. */
function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/** Create an AbortSignal that times out after `ms` milliseconds. */
function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

type ResolutionGuard = {
  isCurrent: () => boolean;
};

type ResolvedEntityMatch =
  | { status: 'resolved'; entity: { id: string; name: string } }
  | { status: 'unresolved'; reason: 'none' | 'tie' | 'ambiguous' };

function getCandidateTopSpaceRank(spaceIds: string[]): number {
  if (spaceIds.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...spaceIds.map(getSpaceRank));
}

// ── Match value rows to candidates ─────────────────────────────────────

type Candidate = {
  id: string;
  name: string;
  spaceIds: string[];
  connectedness: number; // backlinks + relations — tiebreaker
};

/**
 * Process raw value rows into resolved matches.
 * Groups by normalized text, collapses by entity.id, ranks, classifies.
 */
function classifyBatchResults(
  valueRows: NameValueMatch[],
  inputNames: string[],
  typeIds: string[],
  hitLimit: boolean
): Map<string, ResolvedEntityMatch> {
  const results = new Map<string, ResolvedEntityMatch>();

  // Step 1: Group value rows by normalized text, collapse by entity.id
  const candidatesByNorm = new Map<string, Map<string, Candidate>>();

  for (const row of valueRows) {
    if (!row.text || !row.entity || !row.entity.id) continue;
    const norm = row.text.trim().toLowerCase();

    // Type-check client-side (values endpoint may return broader results)
    const entityTypeIds = (row.entity.typeIds ?? []).filter((t): t is string => t != null);
    if (typeIds.length > 0 && !entityTypeIds.some(t => typeIds.includes(t))) continue;

    let entityMap = candidatesByNorm.get(norm);
    if (!entityMap) {
      entityMap = new Map();
      candidatesByNorm.set(norm, entityMap);
    }

    const existing = entityMap.get(row.entity.id);
    if (existing) {
      if (!existing.spaceIds.includes(row.spaceId)) {
        existing.spaceIds.push(row.spaceId);
      }
      const connectedness = (row.entity.backlinks?.totalCount ?? 0) + (row.entity.relations?.totalCount ?? 0);
      if (connectedness > existing.connectedness) {
        existing.connectedness = connectedness;
      }
    } else {
      entityMap.set(row.entity.id, {
        id: row.entity.id,
        name: row.entity.name ?? row.text,
        spaceIds: [row.spaceId],
        connectedness: (row.entity.backlinks?.totalCount ?? 0) + (row.entity.relations?.totalCount ?? 0),
      });
    }
  }

  // Step 2: Classify each input name
  for (const name of inputNames) {
    const norm = name.trim().toLowerCase();
    const entityMap = candidatesByNorm.get(norm);
    const candidates = entityMap ? Array.from(entityMap.values()) : [];

    if (candidates.length === 0) {
      results.set(norm, hitLimit
        ? { status: 'unresolved', reason: 'ambiguous' }
        : { status: 'unresolved', reason: 'none' }
      );
      continue;
    }

    if (candidates.length === 1) {
      results.set(norm, { status: 'resolved', entity: { id: candidates[0].id, name: candidates[0].name } });
      continue;
    }

    // Multiple candidates — rank by space, then connectedness
    const ranked = candidates.map(c => ({
      candidate: c,
      spaceRank: getCandidateTopSpaceRank(c.spaceIds),
    }));
    const bestSpaceRank = Math.min(...ranked.map(r => r.spaceRank));
    const atBestSpace = ranked.filter(r => r.spaceRank === bestSpaceRank);

    if (atBestSpace.length === 1) {
      const winner = atBestSpace[0].candidate;
      results.set(norm, { status: 'resolved', entity: { id: winner.id, name: winner.name } });
      continue;
    }

    // Still tied — use connectedness as tiebreaker
    const bestConnectedness = Math.max(...atBestSpace.map(r => r.candidate.connectedness));
    const atBestConnectedness = atBestSpace.filter(r => r.candidate.connectedness === bestConnectedness);

    if (atBestConnectedness.length === 1) {
      const winner = atBestConnectedness[0].candidate;
      results.set(norm, { status: 'resolved', entity: { id: winner.id, name: winner.name } });
    } else {
      results.set(norm, { status: 'unresolved', reason: 'tie' });
    }
  }

  return results;
}

// ── Batched resolution ─────────────────────────────────────────────────

async function resolveNames(params: {
  names: string[];
  typeIds: string[];
  guard: ResolutionGuard;
}): Promise<Map<string, ResolvedEntityMatch>> {
  const { names, typeIds, guard } = params;
  const results = new Map<string, ResolvedEntityMatch>();

  // Deduplicate
  const normToOriginal = new Map<string, string>();
  for (const name of names) {
    const norm = name.trim().toLowerCase();
    if (!normToOriginal.has(norm)) normToOriginal.set(norm, name);
  }
  if (normToOriginal.size === 0) return results;

  const uniqueNames = Array.from(normToOriginal.values());
  const totalBatches = Math.ceil(uniqueNames.length / BATCH_SIZE);
  const totalRounds = Math.ceil(totalBatches / BATCH_CONCURRENCY);
  if (DEBUG_IMPORT) console.log(`[import:resolve] ${uniqueNames.length} unique names → ${totalBatches} batches of ${BATCH_SIZE}, ${totalRounds} rounds (typeIds=[${typeIds.slice(0, 2).join(',')}${typeIds.length > 2 ? '...' : ''}])`);

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE * BATCH_CONCURRENCY) {
    if (!guard.isCurrent()) return results;
    await yieldToMain();

    const roundBatches: string[][] = [];
    for (let j = 0; j < BATCH_CONCURRENCY; j++) {
      const start = i + j * BATCH_SIZE;
      if (start >= uniqueNames.length) break;
      roundBatches.push(uniqueNames.slice(start, start + BATCH_SIZE));
    }

    const roundNum = Math.floor(i / (BATCH_SIZE * BATCH_CONCURRENCY)) + 1;
    const namesInRound = roundBatches.reduce((n, b) => n + b.length, 0);
    const tRound = performance.now();

    const batchResults = await Promise.allSettled(
      roundBatches.map(async batch => {
        try {
          const valueRows = await Effect.runPromise(
            getNameValuesBatch(
              { names: batch, typeIds: typeIds.length > 0 ? typeIds : undefined },
              timeoutSignal(REQUEST_TIMEOUT_MS)
            )
          );
          const expectedFirst = batch.length * 5;
          const hitLimit = valueRows.length >= expectedFirst;
          if (hitLimit) {
            if (DEBUG_IMPORT) console.warn(`[import:resolve] batch hit first=${expectedFirst} limit — some results may be truncated`);
          }
          return { batch, valueRows, hitLimit, failed: false };
        } catch (error) {
          if (DEBUG_IMPORT) console.warn(`[import:resolve] batch failed for ${batch.length} names`, error);
          return { batch, valueRows: [] as NameValueMatch[], hitLimit: false, failed: true };
        }
      })
    );

    if (DEBUG_IMPORT) console.log(`[import:resolve] round ${roundNum}/${totalRounds}: ${(performance.now() - tRound).toFixed(1)}ms (${namesInRound} names, ${roundBatches.length} requests)`);

    for (const result of batchResults) {
      if (result.status !== 'fulfilled') continue;
      const { batch, valueRows, hitLimit, failed } = result.value;

      if (failed) {
        for (const name of batch) {
          results.set(name.trim().toLowerCase(), { status: 'unresolved', reason: 'ambiguous' });
        }
        continue;
      }

      const classified = classifyBatchResults(valueRows, batch, typeIds, hitLimit);
      for (const [norm, match] of classified) {
        results.set(norm, match);
      }
    }
  }

  return results;
}

// ── Exported resolution functions ──────────────────────────────────────

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

  const typeGroupMap = new Map<
    string,
    { typeIds: string[]; entries: { cacheKey: string; cellValue: string; propertyId: string }[] }
  >();

  for (const rp of relationProperties) {
    const typeKey = [...rp.typeIds].sort().join(',');
    let group = typeGroupMap.get(typeKey);
    if (!group) {
      group = { typeIds: rp.typeIds, entries: [] };
      typeGroupMap.set(typeKey, group);
    }
    for (const cellValue of rp.uniqueCellValues) {
      group.entries.push({
        cacheKey: `${rp.propertyId}::${cellValue}`,
        cellValue,
        propertyId: rp.propertyId,
      });
    }
  }

  const typeNameById = new Map<string, string | null>();
  for (const rp of relationProperties) {
    for (const vt of rp.property.relationValueTypes ?? []) {
      if (!typeNameById.has(vt.id)) {
        typeNameById.set(vt.id, vt.name ?? null);
      }
    }
  }

  for (const group of typeGroupMap.values()) {
    if (!guard.isCurrent()) return { aborted: true, resolvedEntities, unresolvedCount };
    await yieldToMain();

    const uniqueNames = Array.from(new Set(group.entries.map(e => e.cellValue)));
    const resolved = await resolveNames({ names: uniqueNames, typeIds: group.typeIds, guard });

    if (!guard.isCurrent()) return { aborted: true, resolvedEntities, unresolvedCount };

    for (const entry of group.entries) {
      const norm = entry.cellValue.trim().toLowerCase();
      const match = resolved.get(norm);

      if (!match || match.status === 'unresolved') {
        const reason = match?.reason ?? 'ambiguous';
        if (reason === 'none') {
          const firstTypeId = group.typeIds[0];
          resolvedEntities.set(entry.cacheKey, {
            id: ID.createEntityId(),
            name: entry.cellValue,
            status: 'created',
            typeId: firstTypeId,
            typeName: firstTypeId ? typeNameById.get(firstTypeId) ?? null : undefined,
          });
        } else {
          unresolvedCount += 1;
          resolvedEntities.set(entry.cacheKey, { status: 'ambiguous' });
        }
      } else {
        resolvedEntities.set(entry.cacheKey, {
          id: match.entity.id,
          name: match.entity.name,
          status: 'found',
        });
      }
    }
  }

  return { aborted: false, resolvedEntities, unresolvedCount };
}

export async function resolveTypesForRows(params: {
  dataRows: string[][];
  typesColumnIndex: number | undefined;
  guard: ResolutionGuard;
}): Promise<{ aborted: boolean; resolvedTypes: Map<string, { id: string; name: string }> }> {
  const { dataRows, typesColumnIndex, guard } = params;
  const resolvedTypes = new Map<string, { id: string; name: string }>();

  if (typesColumnIndex === undefined) {
    return { aborted: false, resolvedTypes };
  }

  const uniqueTypeNames = new Set<string>();
  for (const row of dataRows) {
    const raw = (row[typesColumnIndex] ?? '').trim();
    if (raw) uniqueTypeNames.add(raw);
  }

  const resolved = await resolveNames({
    names: Array.from(uniqueTypeNames),
    typeIds: [SystemIds.SCHEMA_TYPE],
    guard,
  });

  if (!guard.isCurrent()) return { aborted: true, resolvedTypes };

  for (const typeName of uniqueTypeNames) {
    const match = resolved.get(typeName.trim().toLowerCase());
    if (match?.status === 'resolved') {
      resolvedTypes.set(typeName, { id: match.entity.id, name: match.entity.name });
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
  guard: ResolutionGuard;
}): Promise<{
  aborted: boolean;
  resolvedRows: Map<number, { entityId: string; name: string }>;
  unresolvedRowCount: number;
}> {
  const { dataRows, nameColIdx, selectedType, typesColumnIndex, resolvedTypes, guard } = params;
  const resolvedRows = new Map<number, { entityId: string; name: string }>();
  let unresolvedRowCount = 0;

  type RowMeta = { rowName: string; rowTypeId: string; cacheKey: string };
  const rowMetas: (RowMeta | null)[] = [];
  const uniquePairs = new Map<string, { name: string; typeId: string }>();

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
    const row = dataRows[rowIndex];
    const rowName = (row[nameColIdx] ?? '').trim();
    if (!rowName) { rowMetas.push(null); continue; }

    let rowTypeId: string | null = selectedType?.id ?? null;
    if (typesColumnIndex !== undefined) {
      const rawType = (row[typesColumnIndex] ?? '').trim();
      rowTypeId = rawType ? (resolvedTypes.get(rawType)?.id ?? null) : null;
    }
    if (!rowTypeId) { rowMetas.push(null); continue; }

    const cacheKey = `${rowTypeId}::${rowName.toLowerCase()}`;
    rowMetas.push({ rowName, rowTypeId, cacheKey });
    if (!uniquePairs.has(cacheKey)) {
      uniquePairs.set(cacheKey, { name: rowName, typeId: rowTypeId });
    }
  }

  type CacheEntry = { status: 'resolved'; entityId: string; name: string } | { status: 'unresolved' };
  const cache = new Map<string, CacheEntry>();

  const byTypeId = new Map<string, { cacheKey: string; name: string }[]>();
  for (const [cacheKey, { name, typeId }] of uniquePairs) {
    const list = byTypeId.get(typeId);
    if (list) list.push({ cacheKey, name });
    else byTypeId.set(typeId, [{ cacheKey, name }]);
  }

  for (const [typeId, entries] of byTypeId) {
    if (!guard.isCurrent()) return { aborted: true, resolvedRows, unresolvedRowCount };
    await yieldToMain();

    const uniqueNames = Array.from(new Set(entries.map(e => e.name)));
    const resolved = await resolveNames({ names: uniqueNames, typeIds: [typeId], guard });

    if (!guard.isCurrent()) return { aborted: true, resolvedRows, unresolvedRowCount };

    for (const entry of entries) {
      const norm = entry.name.trim().toLowerCase();
      const match = resolved.get(norm);

      if (match?.status === 'resolved') {
        cache.set(entry.cacheKey, { status: 'resolved', entityId: match.entity.id, name: match.entity.name });
      } else if (!match || match.reason === 'none') {
        const createdEntityId = ID.createEntityId();
        cache.set(entry.cacheKey, { status: 'resolved', entityId: createdEntityId, name: entry.name });
      } else {
        cache.set(entry.cacheKey, { status: 'unresolved' });
      }
    }
  }

  if (!guard.isCurrent()) return { aborted: true, resolvedRows, unresolvedRowCount };

  for (let rowIndex = 0; rowIndex < rowMetas.length; rowIndex++) {
    const meta = rowMetas[rowIndex];
    if (!meta) { unresolvedRowCount += 1; continue; }
    const cached = cache.get(meta.cacheKey);
    if (cached?.status === 'resolved') {
      resolvedRows.set(rowIndex, { entityId: cached.entityId, name: cached.name });
    } else {
      unresolvedRowCount += 1;
    }
  }

  return { aborted: false, resolvedRows, unresolvedRowCount };
}
