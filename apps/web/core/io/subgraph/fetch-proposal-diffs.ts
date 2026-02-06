import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';
import { Diff, type EntityDiff } from '~/core/utils/diff';

import { restFetch, ApiError } from '../rest';
import { ApiProposalDiffResponseSchema } from '../rest';
import { encodePathSegment } from '../rest';
import { AbortError } from './errors';

export async function fetchProposalDiffs(proposalId: string, spaceId: string): Promise<EntityDiff[]> {
  const config = Environment.getConfig();

  const allEntities: EntityDiff[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    params.set('spaceId', spaceId);
    params.set('limit', '50');
    if (cursor) {
      params.set('cursor', cursor);
    }

    const encodedId = encodePathSegment(proposalId);
    const path = `/versioned/proposals/${encodedId}/diff?${params.toString()}`;

    const result = await Effect.runPromise(
      Effect.either(
        restFetch<unknown>({
          endpoint: config.api,
          path,
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

      console.error(`Failed to fetch proposal diffs for ${proposalId}:`, error);
      return allEntities;
    }

    const decoded = Schema.decodeUnknownEither(ApiProposalDiffResponseSchema)(result.right);

    if (Either.isLeft(decoded)) {
      console.error(`Failed to decode proposal diffs for ${proposalId}:`, decoded.left);
      return allEntities;
    }

    const page = decoded.right;
    allEntities.push(...page.entities.map(Diff.mapApiEntityDiff));

    cursor = page.pagination.cursor;
    hasMore = page.pagination.hasMore;
  }

  return Diff.postProcessDiffs(allEntities, spaceId);
}
