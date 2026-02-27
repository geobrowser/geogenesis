import { SystemIds } from '@geoprotocol/geo-sdk';
import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { snapshotToDiff } from '~/core/io/dto/snapshot-to-diff';
import { getBatchEntities } from '~/core/io/queries';
import { Diff, type EntityDiff } from '~/core/utils/diff';

import { ApiError, restFetch } from '../rest';
import { ApiEntityDiffResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';
import { fetchEntitySnapshot } from './fetch-entity-snapshot';

interface FetchEntityDiffArgs {
  entityId: string;
  /** When omitted, returns an all-added diff representing the entity's creation. */
  fromEditId?: string;
  toEditId: string;
  spaceId: string;
  signal?: AbortSignal;
}

export async function fetchEntityDiff({
  entityId,
  fromEditId,
  toEditId,
  spaceId,
  signal,
}: FetchEntityDiffArgs): Promise<EntityDiff | null> {
  // No previous version — fetch the snapshot and convert to an all-added diff
  if (!fromEditId) {
    const snapshot = await fetchEntitySnapshot({ entityId, editId: toEditId, spaceId, signal });
    if (!snapshot) return null;

    const entityDiff = snapshotToDiff(snapshot);
    if (process.env.NODE_ENV === 'development') {
      console.log('[diff:history-snapshot] before postProcessDiffs ' + JSON.stringify([entityDiff]));
    }
    const processed = await Diff.postProcessDiffs([entityDiff], spaceId);
    if (process.env.NODE_ENV === 'development') {
      console.log('[diff:history-snapshot] after postProcessDiffs ' + JSON.stringify(processed));
    }
    return processed[0] ?? null;
  }

  const entityDiff = await fetchRawEntityDiff({ entityId, fromEditId, toEditId, spaceId, signal });
  if (!entityDiff) return null;

  // Discover block entity IDs via the entity's current BLOCKS relations.
  // Then fetch each block entity's diff for the same edit range so that
  // postProcessDiffs can group them under the parent — matching the proposal path.
  const blockEntityIds = await discoverBlockEntityIds(entityId, spaceId);

  const blockDiffs = await Promise.all(
    blockEntityIds.map(blockId =>
      fetchRawEntityDiff({ entityId: blockId, fromEditId, toEditId, spaceId, signal }).catch(() => null)
    )
  );

  // Filter out nulls and empty diffs (blocks with no changes in this version range)
  const validBlockDiffs = blockDiffs.filter(
    (d): d is EntityDiff => d !== null && (d.values.length > 0 || d.relations.length > 0 || d.blocks.length > 0)
  );

  const allDiffs = [entityDiff, ...validBlockDiffs];
  if (process.env.NODE_ENV === 'development') {
    console.log('[diff:history] before postProcessDiffs ' + JSON.stringify(allDiffs));
  }
  const processed = await Diff.postProcessDiffs(allDiffs, spaceId);
  if (process.env.NODE_ENV === 'development') {
    console.log('[diff:history] after postProcessDiffs ' + JSON.stringify(processed));
  }

  // Return the parent entity (blocks should be folded into it by postProcessDiffs)
  return processed.find(d => d.entityId === entityId) ?? processed[0] ?? null;
}

/**
 * Fetch and decode a single entity's raw diff (before postProcessDiffs).
 * Returns null on 404 or decode failure.
 */
async function fetchRawEntityDiff({
  entityId,
  fromEditId,
  toEditId,
  spaceId,
  signal,
}: {
  entityId: string;
  fromEditId: string;
  toEditId: string;
  spaceId: string;
  signal?: AbortSignal;
}): Promise<EntityDiff | null> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('fromEditId', fromEditId);
  params.set('toEditId', toEditId);
  params.set('spaceId', spaceId);

  const encodedId = encodePathSegment(entityId);
  const path = `/versioned/entities/${encodedId}/diff?${params.toString()}`;

  const result = await Effect.runPromise(
    Effect.either(
      restFetch<unknown>({
        endpoint: config.api,
        path,
        signal,
      })
    )
  );

  if (Either.isLeft(result)) {
    const error = result.left;

    if (error instanceof AbortError) {
      throw error;
    }

    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    console.error(`Failed to fetch entity diff for ${entityId}:`, error);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiEntityDiffResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode entity diff for ${entityId}:`, decoded.left);
    return null;
  }

  return Diff.mapApiEntityDiff(decoded.right);
}

/**
 * Look up the entity's current BLOCKS relations via GraphQL to find block entity IDs.
 * Returns an empty array on failure.
 */
async function discoverBlockEntityIds(entityId: string, spaceId: string): Promise<string[]> {
  try {
    const entities = await Effect.runPromise(getBatchEntities([entityId], spaceId));
    const entity = entities[0];
    if (!entity) return [];

    return entity.relations.filter(r => r.type.id === SystemIds.BLOCKS).map(r => r.toEntity.id);
  } catch {
    return [];
  }
}
