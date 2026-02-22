import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { encodePathSegment, restFetch } from '../rest';
import { AbortError } from './errors';

const ActiveProposalResponseSchema = Schema.Struct({
  active: Schema.Boolean,
});

/**
 * Check whether a specific member has an active (PROPOSED or EXECUTABLE)
 * ADD_MEMBER proposal in the given space.
 *
 * Uses the targeted REST endpoint which runs a single SELECT EXISTS query
 * server-side, avoiding the need to fetch all proposals and filter client-side.
 */
export async function hasActiveMemberProposal(spaceId: string, memberSpaceId: string): Promise<boolean> {
  const config = Environment.getConfig();

  const path = `/proposals/space/${encodePathSegment(spaceId)}/members/${encodePathSegment(memberSpaceId)}/active`;

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

    console.error(`Failed to check active member proposal for space ${spaceId}, member ${memberSpaceId}:`, error);
    return false;
  }

  const decoded = Schema.decodeUnknownEither(ActiveProposalResponseSchema)(result.right);

  if (Either.isLeft(decoded)) {
    console.error(
      `Failed to decode active member proposal response for space ${spaceId}, member ${memberSpaceId}:`,
      decoded.left
    );
    return false;
  }

  return decoded.right.active;
}
