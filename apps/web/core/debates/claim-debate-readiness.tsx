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

import { type DebateClaim, GeoChatRequestError } from './api';
import { DebateEntityResponseControls } from './debate-entity-response-controls';
import { useDebateReadinessIntent } from './debate-readiness-intent';
import { useGeoChatAuth, useJoinDebateQueue, useLeaveDebateQueue } from './hooks';

type ClaimDebateReadinessProps = {
  debateClaim: DebateClaim | null;
  entityId: string;
  spaceId: string;
  canEnable: boolean;
  className?: string;
  textVariant?: 'metadata' | 'body';
  compact?: boolean;
};

export function ClaimDebateReadiness({
  debateClaim,
  entityId,
  spaceId,
  canEnable,
  className,
  textVariant = 'metadata',
  compact = false,
}: ClaimDebateReadinessProps) {
  if (!debateClaim) {
    return compact ? (
      <DebateToggle checked={false} disabled className={className} title="Debate readiness is loading" />
    ) : null;
  }

  return (
    <ClaimDebateReadinessContent
      debateClaim={debateClaim}
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
  entityId,
  spaceId,
  canEnable,
  className,
  textVariant = 'metadata',
  compact = false,
}: Omit<ClaimDebateReadinessProps, 'debateClaim'> & { debateClaim: DebateClaim }) {
  const queryClient = useQueryClient();
  const joinQueue = useJoinDebateQueue(spaceId);
  const leaveQueue = useLeaveDebateQueue(spaceId);
  const { accountKey, authenticated } = useGeoChatAuth();
  const responseIndexing = useEntityResponseIndexingSnapshot({
    entityId,
    spaceId,
    responseKind: debateClaim.response_kind,
  });
  const resetResponseIndexing = useResetEntityResponseIndexingSnapshot({
    entityId,
    spaceId,
    responseKind: debateClaim.response_kind,
  });
  const {
    intent,
    queryKey: intentQueryKey,
    setIntent,
  } = useDebateReadinessIntent(accountKey, spaceId, entityId, debateClaim.response_kind);
  const [intentError, setIntentError] = React.useState<string | null>(null);
  const previousIntentKeyRef = React.useRef(intentQueryKey);

  React.useEffect(() => {
    const previousKey = previousIntentKeyRef.current;
    if (previousKey !== intentQueryKey) {
      queryClient.setQueryData(previousKey, null);
      previousIntentKeyRef.current = intentQueryKey;
    }
  }, [intentQueryKey, queryClient]);

  const pendingResponse = responseIndexing.status === 'idle' ? null : responseIndexing.pending;
  const optimisticPosition =
    pendingResponse?.expectedResponse == null ? null : pendingResponse.expectedResponse === 'positive';
  const viewerPosition = pendingResponse ? optimisticPosition : (debateClaim.viewer_response?.position ?? null);
  const backendReady = debateClaim.viewer_debate_ready;
  const responseWithdrawalPending = Boolean(pendingResponse && pendingResponse.expectedResponse === null);
  const checked = responseWithdrawalPending ? false : (intent?.desiredReady ?? backendReady);
  const isSaving =
    intent?.status === 'submitting' || intent?.status === 'settling' || joinQueue.isPending || leaveQueue.isPending;
  const canEnableToggle = viewerPosition !== null && authenticated && canEnable;
  const disabled = isSaving || (!checked && !canEnableToggle);

  React.useEffect(
    function reconcileReadinessIntent() {
      if (!intent) return;
      if (!authenticated || !accountKey) {
        setIntent(null);
        return;
      }

      if (!intent.desiredReady) {
        if (!backendReady) setIntent(null);
        return;
      }

      if (backendReady) {
        setIntent(null);
        return;
      }

      if (intent.responseRunId && (intent.status === 'waiting' || intent.status === 'refreshing')) {
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

      if (debateClaim.viewer_response?.position !== intent.expectedPosition) {
        if (!intent.responseRunId || responseIndexing.status === 'idle') setIntent(null);
        return;
      }
      if (intent.status !== 'waiting') return;

      setIntent({ ...intent, status: 'submitting' });
      joinQueue.mutate(
        { claimId: entityId },
        {
          onSuccess: () => {
            const current = queryClient.getQueryData<typeof intent>(intentQueryKey);
            if (current?.desiredReady) setIntent({ ...current, status: 'settling' });
          },
          onError: error => {
            const current = queryClient.getQueryData<typeof intent>(intentQueryKey);
            if (
              current?.desiredReady &&
              error instanceof GeoChatRequestError &&
              error.code === 'claim_response_required' &&
              !current.hasRetried
            ) {
              setIntent({ ...current, hasRetried: true, status: 'refreshing' });
              joinQueue.reset();
              void queryClient.refetchQueries({ queryKey: ['debates', 'claims', spaceId] }).finally(() => {
                const refreshed = queryClient.getQueryData<typeof intent>(intentQueryKey);
                if (refreshed?.desiredReady && refreshed.status === 'refreshing') {
                  setIntent({ ...refreshed, status: 'waiting' });
                }
              });
              return;
            }

            setIntent(null);
            setIntentError(error instanceof Error ? error.message : 'Could not update debate readiness.');
          },
        }
      );
    },
    [
      accountKey,
      authenticated,
      backendReady,
      debateClaim.viewer_response?.position,
      entityId,
      intent,
      intentQueryKey,
      joinQueue,
      queryClient,
      responseIndexing,
      setIntent,
      spaceId,
    ]
  );

  React.useEffect(
    function retireConfirmedOptimisticResponse() {
      if (responseIndexing.status !== 'indexed') return;
      const expectedResponse = responseIndexing.pending.expectedResponse;
      const confirmed =
        expectedResponse === null
          ? debateClaim.viewer_response === null
          : debateClaim.viewer_response?.position === (expectedResponse === 'positive');
      if (confirmed) resetResponseIndexing(responseIndexing.runId);
    },
    [debateClaim.viewer_response, resetResponseIndexing, responseIndexing]
  );

  const handleToggle = () => {
    setIntentError(null);

    if (checked) {
      if (intent?.desiredReady) {
        setIntent(null);
        return;
      }
      if (!backendReady) return;

      setIntent({ desiredReady: false, status: 'submitting' });
      leaveQueue.mutate(
        { claimId: entityId },
        {
          onSuccess: () => setIntent({ desiredReady: false, status: 'settling' }),
          onError: error => {
            setIntent(null);
            setIntentError(error instanceof Error ? error.message : 'Could not update debate readiness.');
          },
        }
      );
      return;
    }

    if (viewerPosition === null || !canEnableToggle) return;
    setIntent({
      desiredReady: true,
      expectedPosition: viewerPosition,
      responseRunId: pendingResponse ? responseIndexing.runId : null,
      hasRetried: false,
      status: 'waiting',
    });
  };

  const toggle = (
    <DebateToggle
      checked={checked}
      disabled={disabled}
      busy={isSaving}
      className={compact ? className : undefined}
      onClick={handleToggle}
    />
  );

  if (compact) return toggle;

  const mutationError =
    intentError ??
    (joinQueue.error instanceof Error
      ? joinQueue.error.message
      : leaveQueue.error instanceof Error
        ? leaveQueue.error.message
        : null);

  return (
    <div className={className}>
      <DebateEntityResponseControls entityId={entityId} spaceId={spaceId} responseKind={debateClaim.response_kind} />
      <div className="mt-2">{toggle}</div>

      {backendReady && !responseWithdrawalPending && (
        <Text as="p" variant={textVariant} color="grey-04" className="mt-2">
          Waiting for someone with the opposite response.
        </Text>
      )}
      {(mutationError || debateClaim.readiness_disabled_reason) && (
        <Text as="p" variant={textVariant} color="red-01" className="mt-2">
          {mutationError ?? readinessReasonMessage(debateClaim.readiness_disabled_reason)}
        </Text>
      )}
    </div>
  );
}

function DebateToggle({
  checked,
  disabled,
  busy = false,
  className,
  onClick,
  title,
}: {
  checked: boolean;
  disabled: boolean;
  busy?: boolean;
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
        'inline-flex h-7 cursor-pointer items-center gap-2 rounded-sm text-button text-grey-04 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-text disabled:cursor-default disabled:opacity-50',
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
    case 'claim_response_withdrawn':
      return 'Your response was withdrawn, so Debate was turned off.';
    case 'claim_response_kind_changed':
      return 'This claim’s response type changed. Respond and enable Debate again.';
    case 'claim_response_validation_failed':
      return 'Your response could not be verified yet. Debate will remain enabled while verification retries.';
    default:
      return reason;
  }
}
