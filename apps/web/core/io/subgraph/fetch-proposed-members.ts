import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { ApiProposalListResponseSchema, encodePathSegment, restFetch } from '../rest';
import { AbortError } from './errors';

/** Compare space ids regardless of dashes / 0x prefix / case. */
const normalizeId = (id: string) => id.replace(/-/g, '').replace(/^0x/i, '').toLowerCase();

export type ActiveMemberRequest = {
  proposalId: string;
  /** False while the vote is still open; true once the period elapsed (passed but not yet executed, or dead). */
  isVotingEnded: boolean;
};

/**
 * Mirrors {@link fetchActiveEditorRequest} for ADD_MEMBER — returns the active
 * request with `isVotingEnded` so the re-request flow can tell "under vote" from
 * "stuck / dead".
 */
export async function fetchActiveMemberRequest(
  spaceId: string,
  memberSpaceId: string
): Promise<ActiveMemberRequest | null> {
  const config = Environment.getConfig();

  // One page (default limit) is plenty — a space has a handful of member
  // requests, not hundreds. Bump to cursor paging only if that changes.
  const path = `/proposals/space/${encodePathSegment(spaceId)}/status?actionTypes=AddMember`;

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
    if (error instanceof AbortError) throw error;
    console.error(`Failed to fetch member requests for space ${spaceId}, member ${memberSpaceId}:`, error);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);
  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode member requests for space ${spaceId}, member ${memberSpaceId}:`, decoded.left);
    return null;
  }

  const target = normalizeId(memberSpaceId);

  const mine = decoded.right.proposals
    .filter(p => p.status === 'PROPOSED' || p.status === 'EXECUTABLE')
    .filter(p => p.actions.some(a => a.actionType === 'ADD_MEMBER' && a.targetId && normalizeId(a.targetId) === target))
    .sort((a, b) => b.timing.endTime - a.timing.endTime);

  const latest = mine[0];
  if (!latest) return null;

  return { proposalId: latest.proposalId, isVotingEnded: latest.timing.isVotingEnded };
}
