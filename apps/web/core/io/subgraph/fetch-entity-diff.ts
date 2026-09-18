import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Diff, type EntityDiff } from '~/core/utils/diff';

import { ApiError, restFetch } from '../rest';
import { ApiEntityDiffResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';

interface FetchEntityDiffArgs {
  entityId: string;
  /** When omitted, the v2 endpoint runs in snapshot mode (all-added diff). */
  fromEditId?: string;
  toEditId: string;
  spaceId: string;
  signal?: AbortSignal;
}

/**
 * Entity diff via the v2 server-enriched endpoint (`/v2/versioned/entities/:id/diff`).
 *
 * v2 resolves names (propertyName / typeName / toEntityName), inlines media URLs
 * at the from/to version, folds the rich block shape (blockName + the block's own
 * values/relations), and merges data-block config — all server-side. So the
 * decoded response maps directly to an `EntityDiff`, and the client-side
 * `postProcessDiffs` pipeline (plus block discovery and per-block fetches) is no
 * longer needed on this path. When `fromEditId` is omitted, the endpoint returns
 * the entity's state at `toEditId` as an all-added (snapshot) diff.
 */
export async function fetchEntityDiff({
  entityId,
  fromEditId,
  toEditId,
  spaceId,
  signal,
}: FetchEntityDiffArgs): Promise<EntityDiff | null> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  if (fromEditId) params.set('fromEditId', fromEditId);
  params.set('toEditId', toEditId);
  params.set('spaceId', spaceId);

  const encodedId = encodePathSegment(entityId);
  const path = `/v2/versioned/entities/${encodedId}/diff?${params.toString()}`;

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
    if (error instanceof AbortError) throw error;
    if (error instanceof ApiError && error.status === 404) return null;
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
