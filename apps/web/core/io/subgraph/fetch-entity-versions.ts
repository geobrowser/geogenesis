import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { ApiError, restFetch } from '../rest';
import { type ApiEntityVersion, ApiEntityVersionsResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';

export type EntityVersion = ApiEntityVersion;

interface FetchEntityVersionsArgs {
  entityId: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

/** Returns versions in reverse chronological order (newest first). */
export async function fetchEntityVersions({
  entityId,
  limit = 10,
  offset = 0,
  signal,
}: FetchEntityVersionsArgs): Promise<EntityVersion[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (offset > 0) {
    params.set('offset', String(offset));
  }

  const encodedId = encodePathSegment(entityId);
  const path = `/versioned/entities/${encodedId}/versions?${params.toString()}`;

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
      return [];
    }

    console.error(`Failed to fetch entity versions for ${entityId}:`, error);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiEntityVersionsResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode entity versions for ${entityId}:`, decoded.left);
    return [];
  }

  return [...decoded.right.versions];
}
