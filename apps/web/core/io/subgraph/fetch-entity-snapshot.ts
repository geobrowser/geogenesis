import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { ApiError, restFetch } from '../rest';
import { type ApiEntitySnapshotResponse, ApiEntitySnapshotResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';

interface FetchEntitySnapshotArgs {
  entityId: string;
  editId: string;
  spaceId?: string;
  signal?: AbortSignal;
}

export async function fetchEntitySnapshot({
  entityId,
  editId,
  spaceId,
  signal,
}: FetchEntitySnapshotArgs): Promise<ApiEntitySnapshotResponse | null> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('editId', editId);
  if (spaceId) {
    params.set('spaceId', spaceId);
  }

  const encodedId = encodePathSegment(entityId);
  const path = `/versioned/entities/${encodedId}?${params.toString()}`;

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

    console.error(`Failed to fetch entity snapshot for ${entityId}:`, error);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiEntitySnapshotResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode entity snapshot for ${entityId}:`, decoded.left);
    return null;
  }

  return decoded.right;
}
