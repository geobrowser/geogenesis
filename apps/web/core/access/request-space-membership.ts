import type { QueryClient } from '@tanstack/react-query';

import { Effect, Either } from 'effect';

import { getSpaceAccessById, normalizeSpaceId } from '~/core/access/space-access';
import { getSpace } from '~/core/io/queries';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { geo } from '~/core/sdk/geo-client';
import { store } from '~/core/state/jotai-store';
import {
  type RequestedMembershipSpace,
  requestedMembershipSpacesAtom,
  upsertRequestedMembershipSpace,
} from '~/core/state/requested-membership';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { validateSpaceId } from '~/core/utils/utils';

/** The shape `useSmartAccountTransaction` returns — kept structural so this module stays hook-free. */
export type SendSpaceTransaction = (args: {
  to: `0x${string}`;
  data: `0x${string}`;
  value?: bigint;
}) => Effect.Effect<unknown, unknown>;

type MembershipSpaceDisplay = { name?: string; image?: string | null };

type RequestSpaceMembershipArgs = {
  /** Space to join, bytes16 hex without 0x (UUID format). */
  spaceId: string | null;
  /** The requester's personal space id, which is what gets proposed as the member. */
  personalSpaceId: string;
  tx: SendSpaceTransaction;
  queryClient: QueryClient;
  /** Optional display data so the optimistic "pending" row can render a name/image immediately. */
  space?: MembershipSpaceDisplay;
  /** Overrides how the optimistic bridge is written — React callers pass their `useSetAtom` setter. */
  setRequestedSpaces?: (update: (prev: RequestedMembershipSpace[]) => RequestedMembershipSpace[]) => void;
};

/**
 * Proposes `personalSpaceId` as a member of `spaceId` on-chain, then records the
 * optimistic "Membership pending" bridge and refetches the durable membership
 * sources.
 *
 * A plain function rather than a hook so background callers can reuse the exact
 * request path the explicit "Join" buttons take without mounting React state on
 * surfaces that render it hundreds of times (every vote control in a list).
 *
 * Throws on an invalid space id or a failed transaction; callers decide whether
 * that surfaces to the user.
 */
export async function requestSpaceMembership({
  spaceId,
  personalSpaceId,
  tx,
  queryClient,
  space,
  setRequestedSpaces,
}: RequestSpaceMembershipArgs): Promise<void> {
  if (!validateSpaceId(spaceId)) {
    throw new Error('Invalid target space ID');
  }

  console.log('Requesting to be member', { authorSpaceId: personalSpaceId, spaceId });

  const { to, calldata } = geo.daoSpaces.proposeRequestMembership({ authorSpaceId: personalSpaceId, spaceId });

  const writeTxEffect = tx({ to, data: calldata }).pipe(
    Effect.withSpan('web.write.requestMembership'),
    Effect.annotateSpans({
      'io.operation': 'request_membership',
      'space.type': 'DAO',
      'governance.action': 'membership_requested',
    })
  );

  const result = await runEffectEither(writeTxEffect);

  if (Either.isLeft(result)) {
    console.error('Failed to request membership', { spaceId, personalSpaceId }, result.left);
    throw result.left;
  }

  console.log('Successfully requested to be member. Transaction hash:', result.right);

  // Optimistic, persisted bridge so the "Membership pending" state shows instantly
  // (and survives a refresh) regardless of where the request was made, while the
  // indexer catches up.
  const write = setRequestedSpaces ?? (update => store.set(requestedMembershipSpacesAtom, update));
  write(prev =>
    upsertRequestedMembershipSpace(prev, {
      id: spaceId,
      ownerId: personalSpaceId,
      requestedAt: Date.now(),
      name: space?.name,
      image: space?.image,
    })
  );

  // Refetch the durable sources so every surface converges on the server state.
  queryClient.invalidateQueries({ queryKey: ['pending-memberships'] });
  queryClient.invalidateQueries({ queryKey: ['browse-sidebar-data'] });
}

/**
 * Dedupes automatic membership requests across every surface that can trigger one
 * (ranking compose, claim responses) so a user who ranks and then responds in the
 * same space only proposes themselves once per session.
 */
const autoRequestedMemberships = new Set<string>();

/** Test seam — the module-level dedupe would otherwise leak between cases. */
export function resetAutoRequestedMemberships() {
  autoRequestedMemberships.clear();
}

type EnsureSpaceMembershipArgs = {
  spaceId: string | null;
  personalSpaceId: string | null;
  tx: SendSpaceTransaction;
  queryClient: QueryClient;
};

/**
 * Contributing to a space's graph — submitting a ranking, or agreeing/disagreeing
 * and verifying/disputing a claim published there — says the user wants to take
 * part in that space, so join them to it if they aren't in it already.
 *
 * Resolves `true` when the user already has access, `false` when a request was
 * made or membership isn't possible. Never throws: this runs alongside an action
 * the user actually asked for, so a failed background request must not break it.
 */
export async function ensureSpaceMembership({
  spaceId,
  personalSpaceId,
  tx,
  queryClient,
}: EnsureSpaceMembershipArgs): Promise<boolean> {
  if (!spaceId || !personalSpaceId) return false;

  const access = await runEffectEither(getSpaceAccessById(spaceId, personalSpaceId));
  if (Either.isRight(access) && access.right.canEdit) {
    return true;
  }

  // Shares the `['space', spaceId]` cache `useSpace` fills, so this is usually free.
  const space = await queryClient
    .fetchQuery({
      queryKey: ['space', spaceId],
      queryFn: () => Effect.runPromise(getSpace(spaceId)),
      staleTime: 60_000,
    })
    .catch(() => null);

  // Only DAO spaces have a membership proposal flow; a personal space you don't
  // own can't be joined at all.
  if (space?.type !== 'DAO') return false;

  const requestKey = `${normalizeSpaceId(spaceId)}:${normalizeSpaceId(personalSpaceId)}`;
  if (autoRequestedMemberships.has(requestKey)) return false;
  autoRequestedMemberships.add(requestKey);

  // Re-request when there's no live vote — a stuck (vote-ended) request must not
  // block a fresh one, otherwise the user is wedged out of the space for good.
  const activeRequest = await fetchActiveMemberRequest(spaceId, personalSpaceId).catch(() => null);
  if (activeRequest != null && !activeRequest.isVotingEnded) return false;

  try {
    await requestSpaceMembership({ spaceId, personalSpaceId, tx, queryClient });
  } catch {
    // Already logged by requestSpaceMembership. The user didn't ask for this
    // request, so don't interrupt them with an error they can't act on.
  }

  return false;
}
