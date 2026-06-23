import { Effect, Either, Schema } from 'effect';

import { Environment } from '~/core/environment';

import { ApiProposalListResponseSchema, encodePathSegment, restFetch } from '../rest';
import { AbortError } from './errors';

/** Compare space ids regardless of dashes / 0x prefix / case. */
const normalizeId = (id: string) => id.replace(/-/g, '').replace(/^0x/i, '').toLowerCase();

export type ActiveEditorRequest = {
  proposalId: string;
  /** False while the vote is still open; true once the period elapsed (passed but not yet executed, or dead). */
  isVotingEnded: boolean;
};

/**
 * Find a member's active (PROPOSED or EXECUTABLE) ADD_EDITOR request in a space.
 *
 * The boolean `/active` endpoint can't tell us the proposal id or whether voting
 * has ended, which the re-apply flow needs to distinguish "under vote" from
 * "stuck / dead" requests. So we read the proposal list filtered to ADD_EDITOR
 * and match the action whose target is this member's space, returning the most
 * recent one.
 */
export async function fetchActiveEditorRequest(
  spaceId: string,
  editorSpaceId: string
): Promise<ActiveEditorRequest | null> {
  const config = Environment.getConfig();

  // One page (default limit) is plenty — a space has a handful of editor
  // requests, not hundreds. Bump to cursor paging only if that changes.
  const path = `/proposals/space/${encodePathSegment(spaceId)}/status?actionTypes=AddEditor`;

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
    console.error(`Failed to fetch editor requests for space ${spaceId}, editor ${editorSpaceId}:`, error);
    return null;
  }

  const decoded = Schema.decodeUnknownEither(ApiProposalListResponseSchema)(result.right);
  if (Either.isLeft(decoded)) {
    console.error(`Failed to decode editor requests for space ${spaceId}, editor ${editorSpaceId}:`, decoded.left);
    return null;
  }

  const target = normalizeId(editorSpaceId);

  const mine = decoded.right.proposals
    .filter(p => p.status === 'PROPOSED' || p.status === 'EXECUTABLE')
    .filter(p => p.actions.some(a => a.actionType === 'ADD_EDITOR' && a.targetId && normalizeId(a.targetId) === target))
    .sort((a, b) => b.timing.endTime - a.timing.endTime);

  const latest = mine[0];
  if (!latest) return null;

  return { proposalId: latest.proposalId, isVotingEnded: latest.timing.isVotingEnded };
}
