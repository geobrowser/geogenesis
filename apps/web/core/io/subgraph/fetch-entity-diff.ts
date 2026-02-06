import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Diff, type EntityDiff } from '~/core/utils/diff';

import { restFetch, ApiError } from '../rest';
import { ApiEntityDiffResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';

interface FetchEntityDiffArgs {
  entityId: string;
  fromEditId: string;
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

  const entityDiff = Diff.mapApiEntityDiff(decoded.right);

  const processed = await Diff.postProcessDiffs([entityDiff], spaceId);
  return processed[0] ?? null;
}
