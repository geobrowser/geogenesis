'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import type { EntityResponseIndexingState } from '~/core/hooks/use-entity-vote';

import {
  type DebateResponseKind,
  GeoChatRequestError,
  type GetPrivyIdentityToken,
  notifyClaimResponseIndexed,
} from './api';
import { refreshRematchClaimBatches, rematchClaimBatchesWithClaim } from './rematch-claims-query-key';

const MAX_NOTIFIED_RUNS = 256;
/** Wait after a 429 that carries no `Retry-After`. */
const RATE_LIMITED_RETRY_MS = 5_000;
/** Attempts after a 429 before a report is dropped. */
const MAX_RATE_LIMITED_RETRIES = 3;

/**
 * Every query whose answer a position write changes, as key prefixes (GEO-2814).
 *
 * These are the three sources the Request debate control reads geo-chat's copy of the position
 * from — Explore's per-space claims, the hub's Claims tab, and the hub's Matches tab. They ask the
 * same question of the same service and are keyed independently, so a refresh has to name all
 * three. Prefixes, because the full keys carry a claim-id batch and a filter set respectively,
 * neither of which is reconstructable from a notification.
 *
 * `matches` is included because a new position can create or dissolve a match outright, not merely
 * change how one renders.
 */
function readinessQueryPrefixes(accountKey: string, spaceId: string) {
  return [
    // Explore cards and the claim page: ['debates', 'claims', spaceId, claimIds, accountKey]
    ['debates', 'claims', spaceId],
    // Hub Claims tab: ['debates', 'account', accountKey, 'matchmaking-claims', filters]
    ['debates', 'account', accountKey, 'matchmaking-claims'],
    // Hub Matches tab: ['debates', 'account', accountKey, 'matches']
    ['debates', 'account', accountKey, 'matches'],
  ] as const;
}
/** Fields shared by pending and indexed response notifications. */
type NotifiableClaimResponse = Pick<
  NonNullable<ReturnType<typeof pendingClaimResponse>>,
  'entityId' | 'position' | 'responseKind' | 'spaceId'
>;
type ClaimReport = {
  /** The indexing query's hash: one viewer, claim, space and response kind. */
  laneKey: string;
  notificationKey: string;
  response: NotifiableClaimResponse;
};
type InterruptedNotification = ClaimReport & { accountKey: string };
type ReportLane = {
  inFlight: boolean;
  /** The newest report that arrived while the lane was busy; it supersedes any older one. */
  waiting: ClaimReport | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  rateLimitedRetries: number;
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
  const [scope, personalSpaceId, entityId, spaceId, responseKind] = queryKey;
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
    /** Whose write this is, so a reader can attribute the row without assuming the current viewer. */
    personalSpaceId: String(personalSpaceId),
    /** Used to distinguish confirmed responses from rolled-back responses. */
    status: indexingState.status,
    /** One per submission, so each submission is reported once. */
    runId: indexingState.runId,
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

    // Reports for one claim go out one at a time, so geo-chat, which keeps whichever arrives last,
    // cannot apply an older switch after a newer one.
    const lanes = new Map<string, ReportLane>();
    const inFlight = new Map<AbortController, ClaimReport>();

    const forgetNotification = (notificationKey: string) => {
      notifiedRuns.current.delete(notificationKey);
      notifiedRunOrder.current = notifiedRunOrder.current.filter(key => key !== notificationKey);
    };

    const laneFor = (laneKey: string) => {
      let lane = lanes.get(laneKey);
      if (!lane) {
        lane = { inFlight: false, waiting: null, retryTimer: null, rateLimitedRetries: 0 };
        lanes.set(laneKey, lane);
      }
      return lane;
    };

    // The only refresh guaranteed to postdate the notification, so every surface reading geo-chat's
    // copy of the position — the rematch picker (GEO-2603) and the readiness sources (GEO-2814) —
    // is asked again here, whether or not the notification succeeded.
    const refreshReadiness = (response: NotifiableClaimResponse) => {
      void refreshRematchClaimBatches(queryClient, rematchClaimBatchesWithClaim(accountKey, response.entityId));
      for (const queryKey of readinessQueryPrefixes(accountKey, response.spaceId)) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };

    const drain = (lane: ReportLane) => {
      if (lane.inFlight || lane.retryTimer || !lane.waiting) return;
      const next = lane.waiting;
      lane.waiting = null;
      send(lane, next);
    };

    const send = (lane: ReportLane, report: ClaimReport) => {
      lane.inFlight = true;
      const controller = new AbortController();
      inFlight.set(controller, report);
      const { response } = report;
      void notifyClaimResponseIndexed(
        response.spaceId,
        response.entityId,
        response.responseKind,
        response.position,
        getPrivyIdentityToken,
        accountKey,
        controller.signal
      )
        .then(() => {
          lane.rateLimitedRetries = 0;
        })
        .catch(error => {
          if (isAbortError(error)) return;
          if (
            error instanceof GeoChatRequestError &&
            error.status === 429 &&
            lane.rateLimitedRetries < MAX_RATE_LIMITED_RETRIES
          ) {
            lane.rateLimitedRetries += 1;
            // A newer report waiting behind this one already carries the newer answer.
            lane.waiting ??= report;
            lane.retryTimer = setTimeout(() => {
              lane.retryTimer = null;
              drain(lane);
            }, error.retryAfterMs ?? RATE_LIMITED_RETRY_MS);
            return;
          }
          lane.rateLimitedRetries = 0;
          // Not delivered, so a later event for the same submission may try again.
          forgetNotification(report.notificationKey);
        })
        .finally(() => {
          inFlight.delete(controller);
          if (controller.signal.aborted) return;
          lane.inFlight = false;
          refreshReadiness(response);
          drain(lane);
        });
    };

    const report = (next: ClaimReport) => {
      if (notifiedRuns.current.has(next.notificationKey)) return;

      notifiedRuns.current.add(next.notificationKey);
      notifiedRunOrder.current.push(next.notificationKey);
      if (notifiedRunOrder.current.length > MAX_NOTIFIED_RUNS) {
        const expired = notifiedRunOrder.current.shift();
        if (expired) notifiedRuns.current.delete(expired);
      }

      const lane = laneFor(next.laneKey);
      if (lane.inFlight || lane.retryTimer) {
        lane.waiting = next;
        return;
      }
      send(lane, next);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const laneKey = event.query.queryHash;

      // Still sent once the chain confirms: if the in-flight report named a position the write never
      // landed, this one carries the truth and geo-chat converges on it.
      const indexed = claimResponseIndexedEvent(event.query.queryKey, event.query.state.data);
      if (indexed) {
        report({ laneKey, notificationKey: `${laneKey}:${indexed.runId}`, response: indexed });
        return;
      }

      // GEO-2784: tell geo-chat the moment the write starts rather than when it indexes, so the
      // opposite side's Request debate appears at once. Keyed apart from the indexed report so both
      // are sent.
      const pending = pendingClaimResponse(event.query.queryKey, event.query.state.data);
      if (!pending) return;
      report({ laneKey, notificationKey: `${laneKey}:pending:${pending.runId}`, response: pending });
    });

    for (const [notificationKey, interrupted] of interruptedNotifications.current) {
      interruptedNotifications.current.delete(notificationKey);
      if (interrupted.accountKey === accountKey) {
        report(interrupted);
      } else {
        forgetNotification(notificationKey);
      }
    }

    return () => {
      unsubscribe();
      // Each lane's newest unsent report is replayed if this account is re-enabled; a waiting
      // report supersedes the one in flight.
      const newest = new Map<string, ClaimReport>();
      for (const inFlightReport of inFlight.values()) newest.set(inFlightReport.laneKey, inFlightReport);
      for (const [laneKey, lane] of lanes) {
        if (lane.retryTimer) clearTimeout(lane.retryTimer);
        if (lane.waiting) newest.set(laneKey, lane.waiting);
      }
      for (const interrupted of newest.values()) {
        interruptedNotifications.current.set(interrupted.notificationKey, { ...interrupted, accountKey });
        forgetNotification(interrupted.notificationKey);
      }
      for (const controller of inFlight.keys()) controller.abort();
      inFlight.clear();
      lanes.clear();
    };
  }, [accountKey, enabled, getPrivyIdentityToken, queryClient]);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
