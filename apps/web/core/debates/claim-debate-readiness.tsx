'use client';

import { useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';

import {
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import { type DebateClaim, type DebateClaimsResponse, type DebateResponseKind, GeoChatRequestError } from './api';
import { DebateEntityResponseControls } from './debate-entity-response-controls';
import { useDebateReadinessIntent } from './debate-readiness-intent';
import { useGeoChatAuth, useJoinDebateQueue, useLeaveDebateQueue } from './hooks';

type ClaimDebateReadinessProps = {
  debateClaim: DebateClaim | null;
  responseKind?: DebateResponseKind | null;
  viewerPosition?: boolean | null;
  entityId: string;
  spaceId: string;
  canEnable: boolean;
  className?: string;
  textVariant?: 'metadata' | 'body';
  compact?: boolean;
};

export function ClaimDebateReadiness({
  debateClaim,
  responseKind: responseKindOverride,
  viewerPosition: viewerPositionOverride,
  entityId,
  spaceId,
  canEnable,
  className,
  textVariant = 'metadata',
  compact = false,
}: ClaimDebateReadinessProps) {
  const responseKind = responseKindOverride ?? debateClaim?.response_kind ?? null;
  if (!responseKind) return null;

  return (
    <ClaimDebateReadinessContent
      debateClaim={debateClaim}
      responseKind={responseKind}
      viewerPosition={viewerPositionOverride}
      entityId={entityId}
      spaceId={spaceId}
      canEnable={canEnable}
      className={className}
      textVariant={textVariant}
      compact={compact}
    />
  );
}

function ClaimDebateReadinessContent({
  debateClaim,
  responseKind,
  viewerPosition: viewerPositionOverride,
  entityId,
  spaceId,
  canEnable,
  className,
  textVariant = 'metadata',
  compact = false,
}: Omit<ClaimDebateReadinessProps, 'debateClaim' | 'responseKind'> & {
  debateClaim: DebateClaim | null;
  responseKind: DebateResponseKind;
}) {
  const queryClient = useQueryClient();
  const joinQueue = useJoinDebateQueue(spaceId);
  const leaveQueue = useLeaveDebateQueue(spaceId);
  const { accountKey, authenticated } = useGeoChatAuth();
  const responseIndexing = useEntityResponseIndexingSnapshot({
    entityId,
    spaceId,
    responseKind,
  });
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot({
    entityId,
    spaceId,
    responseKind,
  });
  const { intent, setIntent, updateIntent } = useDebateReadinessIntent(accountKey, spaceId, entityId, responseKind);

  const pendingResponse = responseIndexing.status === 'idle' ? null : responseIndexing.pending;
  const optimisticPosition =
    pendingResponse?.expectedResponse == null ? null : pendingResponse.expectedResponse === 'positive';
  const confirmedViewerPosition =
    viewerPositionOverride === undefined ? (debateClaim?.viewer_response?.position ?? null) : viewerPositionOverride;
  const viewerPosition = pendingResponse ? optimisticPosition : confirmedViewerPosition;
  const backendReady = debateClaim?.viewer_debate_ready ?? false;
  const responseWithdrawalPending = Boolean(pendingResponse && pendingResponse.expectedResponse === null);
  const checked = responseWithdrawalPending ? false : (intent?.desiredReady ?? backendReady);
  const intentRequestInFlight = intent?.inFlightReady !== null && intent?.inFlightReady !== undefined;
  const isSaving = intentRequestInFlight || joinQueue.isPending || leaveQueue.isPending;
  const canEnableToggle = viewerPosition !== null && authenticated && canEnable;
  const disabled = !checked && !canEnableToggle;

  React.useEffect(
    function reconcileReadinessIntent() {
      if (!intent) return;
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

      if (intent.desiredReady && intent.responseRunId) {
        if (responseIndexing.status === 'idle' || responseIndexing.runId !== intent.responseRunId) {
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
      }

      if (intent.desiredReady && confirmedViewerPosition !== intent.expectedPosition) {
        if (!intent.responseRunId || responseIndexing.status === 'idle') setIntent(null);
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
                  claims: current.claims.some(claim => claim.claim_entity_id === result.claim.claim_entity_id)
                    ? current.claims.map(claim =>
                        claim.claim_entity_id === result.claim.claim_entity_id ? result.claim : claim
                      )
                    : [...current.claims, result.claim],
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
      authenticated,
      backendReady,
      confirmedViewerPosition,
      entityId,
      intent,
      joinQueue,
      queryClient,
      responseIndexing,
      responseWithdrawalPending,
      setIntent,
      spaceId,
      updateIntent,
    ]
  );

  React.useEffect(
    function retireConfirmedOptimisticResponse() {
      if (responseIndexing.status !== 'indexed') return;
      const expectedResponse = responseIndexing.pending.expectedResponse;
      const confirmed =
        expectedResponse === null
          ? confirmedViewerPosition === null
          : confirmedViewerPosition === (expectedResponse === 'positive');
      if (confirmed) resetResponseIndexing(responseIndexing.runId);
    },
    [confirmedViewerPosition, resetResponseIndexing, responseIndexing]
  );

  const handleToggle = () => {
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
  };

  const toggle =
    viewerPosition === null ? null : (
      <DebateToggle
        checked={checked}
        disabled={disabled}
        busy={isSaving}
        compact={compact}
        className={compact ? className : undefined}
        onClick={handleToggle}
      />
    );

  if (compact) return toggle;

  const readinessMessage = readinessReasonMessage(debateClaim?.readiness_disabled_reason ?? null);

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <DebateEntityResponseControls entityId={entityId} spaceId={spaceId} responseKind={responseKind} />
        {toggle}
      </div>

      {(intent?.error || readinessMessage) && (
        <Text as="p" variant={textVariant} color="red-01" className="mt-2">
          {intent?.error ?? readinessMessage}
        </Text>
      )}
    </div>
  );
}

function DebateToggle({
  checked,
  disabled,
  busy = false,
  compact = false,
  className,
  onClick,
  title,
}: {
  checked: boolean;
  disabled: boolean;
  busy?: boolean;
  compact?: boolean;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  const descriptionId = React.useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      aria-label="Debate"
      aria-describedby={disabled && title ? descriptionId : undefined}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cx(
        'inline-flex cursor-pointer items-center gap-2 rounded-sm text-button text-grey-04 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-50',
        compact ? 'h-5' : 'h-7',
        className
      )}
    >
      <Toggle checked={checked} className="shrink-0" />
      <span>Debate</span>
      {disabled && title && (
        <span id={descriptionId} className="sr-only">
          {title}
        </span>
      )}
    </button>
  );
}

function readinessReasonMessage(reason: string | null) {
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
