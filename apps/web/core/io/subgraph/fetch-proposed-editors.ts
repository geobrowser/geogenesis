import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { ApiProposalListResponseSchema, encodePathSegment, restFetch, validateActionTypes } from '../rest';
import { AbortError } from './errors';

export interface FetchProposedEditorsOptions {
  id: string;
}

/**
 * Fetch the space IDs of editors with active (non-rejected, non-expired) ADD_EDITOR proposals.
 *
 * Uses the REST API which correctly computes proposal status, handling both
 * time-based expiry and fast-path rejections (where a proposal can be rejected
 * before the voting period ends).
 */
export async function fetchProposedEditors(options: FetchProposedEditorsOptions): Promise<string[]> {
  const config = Environment.getConfig();

  const params = new URLSearchParams();
  params.set('limit', '100');
  params.set('status', 'PROPOSED,EXECUTABLE');
  params.set('actionTypes', validateActionTypes(['AddEditor']).join(','));

  const path = `/proposals/space/${encodePathSegment(options.id)}/status?${params.toString()}`;

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

    console.error(`Failed to fetch proposed editors for space ${options.id}:`, error);
    return [];
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode proposed editors for space ${options.id}:`, decoded.left);
    return [];
  }

  const targetIds = decoded.right.proposals.flatMap(proposal =>
    proposal.actions
      .filter(a => a.actionType === 'ADD_EDITOR')
      .map(a => a.targetId)
      .filter((id): id is string => id != null)
  );

  return targetIds;
}
