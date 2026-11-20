'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Effect, Either } from 'effect';

import { dashlessId } from '~/core/debates/api';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { useSmartAccountTransaction } from '~/core/hooks/use-smart-account-transaction';
import { geo } from '~/core/sdk/geo-client';
import { useFeatureFlag } from '~/core/state/feature-flags';
import { useStatusBar } from '~/core/state/status-bar-store';
import { runEffectEither } from '~/core/telemetry/effect-runtime';
import { normId } from '~/core/utils/norm-id';

import type { GeoPublisherProposal, GeoPublisherStatus } from './types';

/** While a grant is under vote, so the notice goes away soon after it lands. */
export const PENDING_STATUS_POLL_MS = 30_000;

export const geoPublisherKeys = {
  status: (spaceId: string, accountKey: string | null) =>
    ['space-calls', 'geo-publisher', dashlessId(spaceId), accountKey] as const,
  /** Set locally once this session sent a proposal; never fetched. */
  sent: (spaceId: string, accountKey: string | null) =>
    ['space-calls', 'geo-publisher-sent', dashlessId(spaceId), accountKey] as const,
};

const ROUTE = '/api/space-calls/publisher';

async function authHeaders(getToken: () => Promise<string | null>): Promise<Record<string, string> | null> {
  const token = await getToken();
  return token ? { authorization: `Bearer ${token}` } : null;
}

/** Any refusal or failure is `unknown`: the notice shows only on a definite answer. */
export async function fetchGeoPublisherStatus(
  spaceId: string,
  getToken: () => Promise<string | null>,
  signal?: AbortSignal
): Promise<GeoPublisherStatus> {
  const headers = await authHeaders(getToken);
  if (!headers) return 'unknown';
  try {
    const response = await fetch(`${ROUTE}?spaceId=${encodeURIComponent(dashlessId(spaceId))}`, {
      headers,
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return 'unknown';
    const body = (await response.json()) as { status?: unknown };
    return body.status === 'editor' ||
      body.status === 'pending' ||
      body.status === 'executable' ||
      body.status === 'check_failed' ||
      body.status === 'not_editor'
      ? body.status
      : 'unknown';
  } catch (error) {
    if (signal?.aborted) throw error;
    return 'unknown';
  }
}

/**
 * The Geo publisher notice for a viewer who edits the space (`viewerIsEditor`). Behind
 * `spaceCalls`; nothing is asked for anyone else.
 */
export function useGeoPublisherNotice(spaceId: string, viewerIsEditor: boolean) {
  const enabled = useFeatureFlag('spaceCalls');
  const { accountKey, authenticated, ready, getPrivyIdentityToken } = useGeoChatAuth();
  const sent = useQuery({
    queryKey: geoPublisherKeys.sent(spaceId, accountKey),
    queryFn: () => false,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const status = useQuery({
    queryKey: geoPublisherKeys.status(spaceId, accountKey),
    queryFn: ({ signal }) => fetchGeoPublisherStatus(spaceId, getPrivyIdentityToken, signal),
    enabled: enabled && viewerIsEditor && ready && authenticated && Boolean(spaceId),
    staleTime: 60_000,
    refetchInterval: query =>
      query.state.data === 'pending' ||
      query.state.data === 'executable' ||
      query.state.data === 'check_failed' ||
      (sent.data === true && query.state.data !== 'editor')
        ? PENDING_STATUS_POLL_MS
        : false,
  });
  return geoPublisherNoticeState({ status: status.data, sent: sent.data === true });
}

export type GeoPublisherNoticeState = 'hidden' | 'add' | 'pending' | 'executable' | 'check_failed';

/**
 * A sent proposal reads `pending` until the grant lands, even while the indexer has not shown the
 * proposal yet, so the button never comes back for a second send.
 */
export function geoPublisherNoticeState({
  status,
  sent,
}: {
  status: GeoPublisherStatus | undefined;
  sent: boolean;
}): GeoPublisherNoticeState {
  if (status === 'editor' || status === 'unknown' || status === undefined) return 'hidden';
  if (status === 'executable') return 'executable';
  if (status === 'check_failed') return 'check_failed';
  if (status === 'pending' || sent) return 'pending';
  return 'add';
}

class AddGeoPublisherError extends Error {}

const FAILURE_COPY: Record<string, string> = {
  already_editor: 'The Geo publisher is already an editor of this space.',
  request_pending: 'A proposal to add the Geo publisher is already open in Governance.',
  editor_required: 'Only editors of this space can add the Geo publisher.',
  status_check_failed: "Couldn't check Geo publisher status. Try again in a moment.",
};

async function requestProposal(spaceId: string, getToken: () => Promise<string | null>) {
  const headers = await authHeaders(getToken);
  if (!headers) throw new AddGeoPublisherError('Sign in again to add the Geo publisher.');
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ spaceId: dashlessId(spaceId) }),
  });
  if (!response.ok) {
    const code = ((await response.json().catch(() => null)) as { error?: string } | null)?.error ?? '';
    throw new AddGeoPublisherError(FAILURE_COPY[code] ?? 'Could not add the Geo publisher. Try again.');
  }
  return (await response.json()) as GeoPublisherProposal;
}

/**
 * Proposes the Geo publisher as an editor of the space, then votes YES as the proposer. Editor
 * changes are slow path only on the DAO contract, so there is no fast-path proposal to send; the
 * proposer's vote executes it at once where it clears the space's support threshold (for example,
 * a space with one editor), and otherwise it waits for the other editors. Either way the status
 * reads `pending` until the graph shows the grant.
 */
export function useAddGeoPublisher(spaceId: string) {
  const { dispatch } = useStatusBar();
  const queryClient = useQueryClient();
  const { accountKey, getPrivyIdentityToken } = useGeoChatAuth();
  const { personalSpaceId, isRegistered } = usePersonalSpaceId();
  const tx = useSmartAccountTransaction();

  return useMutation({
    mutationFn: async () => {
      if (!personalSpaceId || !isRegistered) {
        throw new AddGeoPublisherError('You need a registered personal space to add the Geo publisher.');
      }
      const proposal = await requestProposal(spaceId, getPrivyIdentityToken);
      // The server proposes on behalf of the signed-in account; refuse if that is not this wallet.
      if (normId(proposal.authorSpaceId) !== normId(personalSpaceId)) {
        throw new AddGeoPublisherError('Your sign-in and wallet do not match. Sign in again.');
      }

      const create = await runEffectEither(
        tx({ to: proposal.to, data: proposal.calldata }).pipe(
          Effect.withSpan('web.write.createProposal.addGeoPublisher'),
          Effect.annotateSpans({
            'io.operation': 'create_proposal',
            'space.type': 'DAO',
            'governance.action': 'proposal_created',
            'governance.proposal_action': 'add_editor',
            'governance.voting_mode': 'SLOW',
          })
        )
      );
      if (Either.isLeft(create)) throw create.left;
      // From here a proposal exists: show it as pending even if the vote below fails.
      queryClient.setQueryData(geoPublisherKeys.sent(spaceId, accountKey), true);

      const vote = geo.daoSpaces.voteProposal({
        authorSpaceId: proposal.authorSpaceId,
        spaceId: dashlessId(spaceId),
        proposalId: proposal.proposalId,
        vote: 'YES',
      });
      const voted = await runEffectEither(
        tx({ to: vote.to as `0x${string}`, data: vote.calldata as `0x${string}` }).pipe(
          Effect.withSpan('web.write.vote.addGeoPublisher'),
          Effect.annotateSpans({ 'io.operation': 'vote', 'space.type': 'DAO', 'governance.action': 'proposal_voted' })
        )
      );
      if (Either.isLeft(voted)) {
        throw new AddGeoPublisherError('The proposal was sent, but your vote failed. Vote on it in Governance.');
      }
    },
    onError: error => {
      console.error('[geo-publisher] add editor failed', { spaceId }, error);
      dispatch({
        type: 'ERROR',
        payload: error instanceof AddGeoPublisherError ? error.message : 'Could not add the Geo publisher. Try again.',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: geoPublisherKeys.status(spaceId, accountKey) });
    },
  });
}
