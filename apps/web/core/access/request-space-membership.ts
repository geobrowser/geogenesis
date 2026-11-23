import type { QueryClient } from '@tanstack/react-query';

import { Effect, Either } from 'effect';

import { getSpaceAccessById, normalizeSpaceId } from '~/core/access/space-access';
import { getSpace } from '~/core/io/queries';
import { fetchActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';
import { geo } from '~/core/sdk/geo-client';
import { store } from '~/core/state/jotai-store';
import { requestedMembershipSpacesAtom, upsertRequestedMembershipSpace } from '~/core/state/requested-membership';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { readFastPathRestricted } from '~/core/utils/contracts/read-space-membership';
import { devLog } from '~/core/utils/dev-log';
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
  // indexer catches up. Written straight to the app's jotai store — the one the
  // Provider in `core/providers.tsx` renders with — so background callers get the
  // same optimistic update as the components that set it through `useSetAtom`.
  //
  // Callers that already wrote the bridge ahead of the tx (onboarding seeds under the
  // wallet address before the personal space id exists) still want this: it writes a
  // personalSpaceId-scoped entry and re-stamps requestedAt so REQUEST_BRIDGE_TTL_MS
  // runs from the tx landing. Onboarding then drops its address-scoped row.
  store.set(requestedMembershipSpacesAtom, prev =>
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
 * Whether `personalSpaceId` can't request to join `spaceId`: the one rule every membership request
 * checks (Join, a queued join, and the automatic join after a vote or ranking).
 *
 * Someone on the review path only can't request membership: the contract reverts
 * `FastPathRestricted`, and only an editor's proposal can add them. Read fresh from the chain. Fails
 * open: when the read fails this returns false, and the request is sent as before.
 */
export function readIsLockedOut(spaceId: string, personalSpaceId: string): Promise<boolean> {
  return readFastPathRestricted(spaceId, personalSpaceId).catch(() => false);
}

/**
 * Space+account pairs this session has already proposed, or that the contract refuses (the
 * requester is on the review path only). Recorded only once a request actually lands or that refusal
 * is read, so a request that was skipped (one is already under vote) or that failed can still be
 * made later — the caller's next attempt re-runs the checks against current state instead of being
 * suppressed for the rest of the session.
 */
const autoRequestedMemberships = new Map<string, 'requested' | 'skipped'>();

/**
 * Checks in progress, keyed the same way. Concurrent callers — several vote
 * controls for the same space, or a compose screen and its embedded block —
 * share one run rather than racing to propose the same membership twice.
 */
const inFlightMembershipChecks = new Map<string, Promise<SpaceMembershipOutcome>>();

/** Test seam — the module-level dedupe would otherwise leak between cases. */
export function resetAutoRequestedMemberships() {
  autoRequestedMemberships.clear();
  inFlightMembershipChecks.clear();
}

/**
 * What {@link ensureSpaceMembershipOutcome} found or did:
 *
 * - `member`: the user can already edit the space.
 * - `requested`: a membership request is waiting on the space's editors — sent now, sent earlier
 *   this session, or already under vote.
 * - `skipped`: no request is possible: not a DAO space, the user is on the review path only, or
 *   there is no personal space or target space to request with.
 * - `failed`: the request was attempted and didn't land.
 */
export type SpaceMembershipOutcome = 'member' | 'requested' | 'skipped' | 'failed';

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
export function ensureSpaceMembership(args: EnsureSpaceMembershipArgs): Promise<boolean> {
  return ensureSpaceMembershipOutcome(args).then(outcome => outcome === 'member');
}

/**
 * {@link ensureSpaceMembership}, telling apart why the user isn't a member yet — for a caller whose
 * action can't go ahead after a request that failed (the Sources `+`, GEO-3819). Same checks, same
 * dedupe, and never throws either.
 */
export function ensureSpaceMembershipOutcome(args: EnsureSpaceMembershipArgs): Promise<SpaceMembershipOutcome> {
  const { spaceId, personalSpaceId } = args;
  if (!spaceId || !personalSpaceId) return Promise.resolve('skipped');

  const requestKey = `${normalizeSpaceId(spaceId)}:${normalizeSpaceId(personalSpaceId)}`;

  const inFlight = inFlightMembershipChecks.get(requestKey);
  if (inFlight) return inFlight;
  const recorded = autoRequestedMemberships.get(requestKey);
  if (recorded) return Promise.resolve(recorded);

  const check = runMembershipCheck(args, requestKey)
    // Structural backstop for the "never throws" contract above. Every await inside
    // is already guarded, but callers fire this as `void ensureSpaceMembership(...)`
    // alongside an action the user actually asked for — so an unguarded rejection
    // added later would surface as an unhandled rejection on top of a successful
    // vote rather than a caught failure.
    .catch(error => {
      console.error('Automatic membership request failed', { spaceId, personalSpaceId }, error);
      return 'failed' as const;
    })
    .finally(() => inFlightMembershipChecks.delete(requestKey));
  inFlightMembershipChecks.set(requestKey, check);
  return check;
}

async function runMembershipCheck(
  { spaceId, personalSpaceId, tx, queryClient }: EnsureSpaceMembershipArgs,
  requestKey: string
): Promise<SpaceMembershipOutcome> {
  // Narrowed by the caller; repeated here so this function reads on its own.
  if (!spaceId || !personalSpaceId) return 'skipped';

  const access = await runEffectEither(getSpaceAccessById(spaceId, personalSpaceId));
  if (Either.isRight(access) && access.right.canEdit) {
    return 'member';
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
  if (space?.type !== 'DAO') return 'skipped';

  // Re-request when there's no live vote — a stuck (vote-ended) request must not
  // block a fresh one, otherwise the user is wedged out of the space for good.
  const activeRequest = await fetchActiveMemberRequest(spaceId, personalSpaceId).catch(() => null);
  if (activeRequest != null && !activeRequest.isVotingEnded) return 'requested';

  // The contract refuses a request from someone on the review path only. Skip quietly, as the user
  // asked to vote or rank, not to join (Join shows them how to ask an editor). Recorded like a landed
  // request so later votes don't read or retry it this session; a restriction lifted mid-session
  // resumes auto-join after a reload. A failed read falls through to the request, as before.
  if (await readIsLockedOut(spaceId, personalSpaceId)) {
    devLog('Skipping automatic membership request: requester is restricted', { spaceId, personalSpaceId });
    autoRequestedMemberships.set(requestKey, 'skipped');
    return 'skipped';
  }

  try {
    await requestSpaceMembership({ spaceId, personalSpaceId, tx, queryClient });
    autoRequestedMemberships.set(requestKey, 'requested');
    return 'requested';
  } catch {
    // Already logged by requestSpaceMembership. The vote and ranking callers didn't
    // ask for this request, so they don't interrupt the user with an error they can't
    // act on — and the key stays unrecorded so a later attempt can retry.
    return 'failed';
  }
}
