'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import { type DebateResponseKind, type GetPrivyIdentityToken, notifyClaimResponseIndexed } from './api';

const MAX_NOTIFIED_RUNS = 256;
type IndexedClaimResponse = NonNullable<ReturnType<typeof claimResponseIndexedEvent>>;
type InterruptedNotification = {
  accountKey: string;
  notificationKey: string;
  response: IndexedClaimResponse;
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

    const startNotification = (notificationKey: string, response: IndexedClaimResponse) => {
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
        .finally(() => notificationControllers.delete(controller));
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const response = claimResponseIndexedEvent(event.query.queryKey, event.query.state.data);
      if (!response) return;
      startNotification(`${event.query.queryHash}:${response.runId}`, response);
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
