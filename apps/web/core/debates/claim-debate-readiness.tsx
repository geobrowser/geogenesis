'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  useEntityResponseIndexingSnapshot,
  useResetEntityResponseIndexingSnapshot,
} from '~/core/hooks/use-entity-vote';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import type { DebateClaim } from './api';
import { DebateEntityResponseControls } from './debate-entity-response-controls';
import { readinessReasonMessage, useClaimDebateReadiness } from './use-claim-debate-readiness';

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
    checked,
    disabled,
    isSaving,
    error,
    toggle: onToggle,
  } = useClaimDebateReadiness({
    readiness: debateClaim,
    entityId,
    spaceId,
    canEnable,
  });

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

  const toggle = (
    <DebateToggle
      checked={checked}
      disabled={disabled}
      busy={isSaving}
      className={compact ? className : undefined}
      onClick={onToggle}
    />
  );

  if (compact) return toggle;

  const readinessMessage = readinessReasonMessage(debateClaim.readiness_disabled_reason);

  return (
    <div className={className}>
      <div className="flex items-center gap-4">
        <DebateEntityResponseControls entityId={entityId} spaceId={spaceId} responseKind={debateClaim.response_kind} />
        {toggle}
      </div>

      {(error || readinessMessage) && (
        <Text as="p" variant={textVariant} color="red-01" className="mt-2">
          {error ?? readinessMessage}
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
