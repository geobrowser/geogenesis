'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import { type DebateResponseKind, type GetPrivyIdentityToken, notifyClaimResponseIndexed } from './api';
import { refreshRematchClaimBatches, rematchClaimBatchesWithClaim } from './rematch-claims-query-key';

const MAX_NOTIFIED_RUNS = 256;
/** Fields shared by pending and indexed response notifications. */
type NotifiableClaimResponse = Pick<
  NonNullable<ReturnType<typeof pendingClaimResponse>>,
  'entityId' | 'position' | 'responseKind' | 'spaceId'
>;
type InterruptedNotification = {
  accountKey: string;
  notificationKey: string;
  response: NotifiableClaimResponse;
};

export function claimResponseIndexedEvent(queryKey: readonly unknown[], data: unknown) {
  const [scope, , entityId, spaceId, responseKind] = queryKey;
  const indexingState = data as EntityResponseIndexingState | undefined;
  if (
    scope !== 'entity-response-indexing' ||
    indexingState?.status !== 'indexed' ||
    !indexingState.pending ||
    (responseKind !== 'stance' && responseKind !== 'veracity')
  ) {
    return null;
  }
  return {
    entityId: String(entityId),
    position:
      indexingState.pending.expectedResponse === null ? null : indexingState.pending.expectedResponse === 'positive',
    responseKind: responseKind as DebateResponseKind,
    runId: indexingState.runId,
    spaceId: String(spaceId),
  };
}

/**
 * The same parse as {@link claimResponseIndexedEvent}, but for a response that is still *in
 * flight* rather than one the indexer has confirmed (GEO-2784).
 *
 * `claimResponseIndexedEvent` deliberately waits for `status === 'indexed'`, because its job is to
 * tell geo-chat something true. This one exists for the opposite reason: the viewer's own button
 * should not wait on the indexer. `web.write.entity_response` measures p50 9.9s / p95 48.6s, and
 * `pending.expectedResponse` is known locally the instant the write starts — so the UI can show
 * the position immediately and let the real row replace it when it lands.
 *
 * `expectedResponse === null` is a *removal*, and callers must honour it: clicking a position off
 * should disappear as fast as clicking one on.
 */
export function pendingClaimResponse(queryKey: readonly unknown[], data: unknown) {
  const [scope, , entityId, spaceId, responseKind] = queryKey;
  const indexingState = data as EntityResponseIndexingState | undefined;
  if (
    scope !== 'entity-response-indexing' ||
    !indexingState?.pending ||
    (responseKind !== 'stance' && responseKind !== 'veracity')
  ) {
    return null;
  }
  return {
    entityId: String(entityId),
    position:
      indexingState.pending.expectedResponse === null ? null : indexingState.pending.expectedResponse === 'positive',
    responseKind: responseKind as DebateResponseKind,
    spaceId: String(spaceId),
    /** Used to distinguish confirmed responses from rolled-back responses. */
    status: indexingState.status,
  };
}

export function useClaimResponseIndexedNotifier(
  enabled: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  const queryClient = useQueryClient();
  const notifiedRuns = React.useRef(new Set<string>());
  const notifiedRunOrder = React.useRef<string[]>([]);
  const interruptedNotifications = React.useRef(new Map<string, InterruptedNotification>());

  React.useEffect(() => {
    if (!enabled || !accountKey) return;

    const notificationControllers = new Map<AbortController, InterruptedNotification>();

    const forgetNotification = (notificationKey: string) => {
      notifiedRuns.current.delete(notificationKey);
      notifiedRunOrder.current = notifiedRunOrder.current.filter(key => key !== notificationKey);
    };

    const startNotification = (notificationKey: string, response: NotifiableClaimResponse) => {
      if (notifiedRuns.current.has(notificationKey)) return;

      notifiedRuns.current.add(notificationKey);
      notifiedRunOrder.current.push(notificationKey);
      if (notifiedRunOrder.current.length > MAX_NOTIFIED_RUNS) {
        const expired = notifiedRunOrder.current.shift();
        if (expired) notifiedRuns.current.delete(expired);
      }

      const controller = new AbortController();
      notificationControllers.set(controller, { accountKey, notificationKey, response });
      void notifyClaimResponseIndexed(
        response.spaceId,
        response.entityId,
        response.responseKind,
        response.position,
        getPrivyIdentityToken,
        accountKey,
        controller.signal
      )
        .catch(error => {
          if (isAbortError(error)) return;
          return queryClient.invalidateQueries({ queryKey: ['debates', 'claims', response.spaceId] });
        })
        .finally(() => {
          notificationControllers.delete(controller);
          if (controller.signal.aborted) return;
          // GEO-2603. This call is what puts the response in geo-chat's copy, and the rematch
          // picker gates Request debate on geo-chat agreeing the viewer has taken a side. The
          // picker refreshes its batches off the same `indexed` event that starts this notification,
          // so that refetch races the notification and usually loses — leaving the button hidden
          // until something unrelated happened to refetch. Asking again once the notification has
          // settled is the only refresh guaranteed to postdate it.
          void refreshRematchClaimBatches(queryClient, rematchClaimBatchesWithClaim(accountKey, response.entityId));
        });
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const queryHash = event.query.queryHash;

      const indexed = claimResponseIndexedEvent(event.query.queryKey, event.query.state.data);
      if (indexed) {
        // Still sent once the chain confirms, and it is not redundant: this is the reconciliation
        // half. If the in-flight notification below reported a position the write never landed,
        // this one carries the truth and geo-chat converges on it.
        startNotification(`${queryHash}:${indexed.runId}`, indexed);
        return;
      }

      // GEO-2784. Tell geo-chat the moment the write starts rather than when it finishes.
      // `web.write.entity_response` is p50 9.9s / p95 48.6s, and geo-chat used to refuse an
      // unindexed position outright (409 `claim_response_not_indexed`), so nobody could be offered
      // a debate against a position for ~10s after the click. geo-chat is now the authority on
      // readiness and takes the report immediately.
      //
      // Keyed separately from the indexed notification so both fire: this one makes the opposite
      // side's Request debate appear at once, that one reconciles it. Keyed on the position too,
      // so toggling a side off and on again is reported rather than swallowed as a duplicate.
      const pending = pendingClaimResponse(event.query.queryKey, event.query.state.data);
      if (!pending) return;
      startNotification(`${queryHash}:pending:${String(pending.position)}`, pending);
    });

    for (const [notificationKey, interrupted] of interruptedNotifications.current) {
      interruptedNotifications.current.delete(notificationKey);
      if (interrupted.accountKey === accountKey) {
        startNotification(notificationKey, interrupted.response);
      } else {
        forgetNotification(notificationKey);
      }
    }

    return () => {
      unsubscribe();
      for (const [controller, interrupted] of notificationControllers) {
        interruptedNotifications.current.set(interrupted.notificationKey, interrupted);
        forgetNotification(interrupted.notificationKey);
        controller.abort();
      }
      notificationControllers.clear();
    };
  }, [accountKey, enabled, getPrivyIdentityToken, queryClient]);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
