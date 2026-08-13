'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';

import { type DebateClaimsResponse, GeoChatRequestError, type MatchmakingReadiness } from './api';
import { useDebateReadinessIntent } from './debate-readiness-intent';
import { useGeoChatAuth, useJoinDebateQueue, useLeaveDebateQueue } from './hooks';

export type ClaimDebateReadinessControl = {
  /** Where the switch sits, including a desired state that hasn't been sent to geo-chat yet. */
  checked: boolean;
  disabled: boolean;
  /** A queue request is in flight. The switch stays clickable — reversals are serialized. */
  isSaving: boolean;
  error: string | null;
  /** The viewer's side, read through their own response before geo-chat can see it. */
  viewerPosition: boolean | null;
  toggle: () => void;
};

/**
 * The Debate switch on one claim, decoupled from how long the position underneath it takes to land.
 *
 * Readiness is geo-chat state; the position it depends on is an on-chain claim response, and
 * geo-chat only accepts readiness once it can see an *indexed* active response. Sending on click
 * would therefore fail for the minute or so after the viewer takes a side — which is exactly when
 * they want to stand ready.
 *
 * So a click records an intent instead. The switch moves immediately and the queue request is held
 * until geo-chat's own copy of the response agrees with the one that intent was recorded against.
 * The intent lives in the query cache rather than component state, so it survives the card
 * unmounting — a tab switch, a re-sorted list, a navigation — and so that every surface showing
 * this claim moves as one switch rather than racing each other.
 */
export function useClaimDebateReadiness({
  readiness,
  entityId,
  spaceId,
  canEnable,
}: {
  readiness: MatchmakingReadiness;
  entityId: string;
  spaceId: string;
  canEnable: boolean;
}): ClaimDebateReadinessControl {
  const queryClient = useQueryClient();
  const joinQueue = useJoinDebateQueue(spaceId);
  const leaveQueue = useLeaveDebateQueue(spaceId);
  const { accountKey, authenticated, ready: authReady } = useGeoChatAuth();
  const responseIndexing = useEntityResponseIndexingSnapshot({
    entityId,
    spaceId,
    responseKind: readiness.response_kind,
  });
  // Privy blanks the account while it rehydrates, and the intent is keyed on it — re-keying
  // switches to an empty entry *and* wipes the one being held. A card remounting through that
  // window (which is what the hub's list does when a claim changes section) would silently drop
  // readiness the viewer is waiting on, flicking the switch off. Hold the last settled account
  // until Privy actually has an answer; a real sign-out still re-keys, which is the point.
  const settledAccountKey = React.useRef(accountKey);
  if (authReady) settledAccountKey.current = accountKey;
  const intentAccountKey = authReady ? accountKey : settledAccountKey.current;

  const { intent, setIntent, updateIntent } = useDebateReadinessIntent(
    intentAccountKey,
    spaceId,
    entityId,
    readiness.response_kind
  );

  const pendingResponse = responseIndexing.status === 'idle' ? null : responseIndexing.pending;
  const optimisticPosition =
    pendingResponse?.expectedResponse == null ? null : pendingResponse.expectedResponse === 'positive';
  const viewerPosition = pendingResponse ? optimisticPosition : (readiness.viewer_response?.position ?? null);
  const backendReady = readiness.viewer_debate_ready;
  const responseWithdrawalPending = Boolean(pendingResponse && pendingResponse.expectedResponse === null);
  const checked = responseWithdrawalPending ? false : (intent?.desiredReady ?? backendReady);
  const intentRequestInFlight = intent?.inFlightReady !== null && intent?.inFlightReady !== undefined;
  const isSaving = intentRequestInFlight || joinQueue.isPending || leaveQueue.isPending;
  const canEnableToggle = viewerPosition !== null && authenticated && canEnable;
  const disabled = !checked && !canEnableToggle;

  React.useEffect(
    function reconcileReadinessIntent() {
      if (!intent) return;
      // Privy reports signed-out before it has rehydrated, and a card that remounts mid-rehydration
      // (which is exactly what the hub's list does when a claim moves sections) would read that as
      // a sign-out and throw the held readiness away.
      if (!authReady) return;
      if (!authenticated || !accountKey) {
        setIntent(null);
        return;
      }

      if (responseWithdrawalPending) {
        setIntent(null);
        return;
      }

      if (intent.inFlightReady !== null) return;
      if (intent.refreshing) return;

      if (intent.desiredReady === intent.confirmedReady) {
        if (backendReady === intent.confirmedReady && !intent.error) setIntent(null);
        return;
      }

      // Only watch the response run while we are still waiting on it. The run is retired the moment
      // geo-chat reports the position, so policing it past that point dropped the intent at the
      // instant it came good — the switch flicking itself off just before the card resettled.
      if (intent.desiredReady && readiness.viewer_response?.position !== intent.expectedPosition) {
        if (!intent.responseRunId || responseIndexing.status === 'idle') {
          setIntent(null);
          return;
        }
        if (responseIndexing.runId !== intent.responseRunId) {
          setIntent(null);
          return;
        }
        if (
          !responseIndexing.pending?.expectedResponse ||
          (responseIndexing.pending.expectedResponse === 'positive') !== intent.expectedPosition
        ) {
          setIntent(null);
          return;
        }
        return;
      }

      const submittedReady = intent.desiredReady;
      let requestStarted = false;
      updateIntent(current => {
        if (
          !current ||
          current.inFlightReady !== null ||
          current.refreshing ||
          current.desiredReady !== submittedReady
        ) {
          return current;
        }
        requestStarted = true;
        return { ...current, inFlightReady: submittedReady };
      });
      if (!requestStarted) return;

      const request = submittedReady
        ? joinQueue.mutateAsync({ claimId: entityId })
        : leaveQueue.mutateAsync({ claimId: entityId });

      void request.then(
        result => {
          queryClient.setQueriesData<DebateClaimsResponse>({ queryKey: ['debates', 'claims', spaceId] }, current =>
            current
              ? {
                  ...current,
                  claims: current.claims.map(claim =>
                    claim.claim_entity_id === result.claim.claim_entity_id ? result.claim : claim
                  ),
                }
              : current
          );
          updateIntent(current => {
            if (current?.inFlightReady !== submittedReady) return current;
            return {
              ...current,
              confirmedReady: submittedReady,
              inFlightReady: null,
              error: null,
            };
          });
        },
        error => {
          let retryAfterRefetch = false;
          updateIntent(current => {
            if (current?.inFlightReady !== submittedReady) return current;
            if (
              submittedReady &&
              current.desiredReady &&
              error instanceof GeoChatRequestError &&
              error.code === 'claim_response_required' &&
              !current.hasRetried
            ) {
              retryAfterRefetch = true;
              return {
                ...current,
                hasRetried: true,
                inFlightReady: null,
                refreshing: true,
                error: null,
              };
            }

            const requestError =
              current.desiredReady !== current.confirmedReady
                ? error instanceof Error
                  ? error.message
                  : 'Could not update debate readiness.'
                : null;
            return {
              ...current,
              desiredReady: current.confirmedReady,
              inFlightReady: null,
              refreshing: false,
              error: requestError,
            };
          });

          if (retryAfterRefetch) {
            joinQueue.reset();
            void queryClient.refetchQueries({ queryKey: ['debates', 'claims', spaceId] }).finally(() => {
              updateIntent(current =>
                current?.desiredReady && current.refreshing ? { ...current, refreshing: false } : current
              );
            });
            return;
          }
        }
      );
    },
    [
      accountKey,
      authReady,
      authenticated,
      backendReady,
      entityId,
      intent,
      joinQueue,
      queryClient,
      readiness.viewer_response?.position,
      responseIndexing,
      responseWithdrawalPending,
      setIntent,
      spaceId,
      updateIntent,
    ]
  );

  const toggle = React.useCallback(() => {
    const desiredReady = !checked;
    if (desiredReady && (viewerPosition === null || !canEnableToggle)) return;

    setIntent({
      desiredReady,
      confirmedReady: intent?.confirmedReady ?? backendReady,
      inFlightReady: intent?.inFlightReady ?? null,
      expectedPosition: desiredReady ? viewerPosition : (intent?.expectedPosition ?? viewerPosition),
      responseRunId: desiredReady ? (pendingResponse ? responseIndexing.runId : null) : (intent?.responseRunId ?? null),
      hasRetried: desiredReady ? false : (intent?.hasRetried ?? false),
      refreshing: false,
      error: null,
    });
  }, [
    backendReady,
    canEnableToggle,
    checked,
    intent,
    pendingResponse,
    responseIndexing.runId,
    setIntent,
    viewerPosition,
  ]);

  return { checked, disabled, isSaving, error: intent?.error ?? null, viewerPosition, toggle };
}

/** Turns geo-chat's machine-readable readiness reason into something worth showing, or nothing. */
export function readinessReasonMessage(reason: string | null) {
  switch (reason) {
    case 'user_disabled':
    case 'claim_response_withdrawn':
      return null;
    case 'claim_response_kind_changed':
      return 'This claim’s response type changed. Respond and enable Debate again.';
    case 'claim_response_validation_failed':
      return 'Your response could not be verified yet. Debate will remain enabled while verification retries.';
    default:
      return reason;
  }
}
