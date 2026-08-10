'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { useClaimReadiness } from './hooks';

type Props = {
  claim: DebateClaimSummary;
  readiness: MatchmakingReadiness;
  /** A claim already being debated can't take new readiness. */
  activeDebate?: boolean;
};

/**
 * Readiness is the only half of matchmaking the hub owns — the position underneath it is an
 * on-chain claim response set on the claim itself. So this can always stand you down, but it can
 * only stand you up once the server has an indexed response to derive your side from.
 */
export function ClaimReadinessToggle({ claim, readiness, activeDebate }: Props) {
  const setReadiness = useClaimReadiness();

  const ready = readiness.viewer_debate_ready;
  const blockedReason = activeDebate ? 'This claim is being debated right now.' : readiness.readiness_disabled_reason;
  const missingResponse = readiness.viewer_response === null;
  const canTurnOn = !missingResponse && !blockedReason;
  const disabled = setReadiness.isPending || (!ready && !canTurnOn);

  const explanation = ready
    ? undefined
    : (blockedReason ?? (missingResponse ? `Respond to this claim to debate it.` : undefined));
  const error = setReadiness.error instanceof Error ? setReadiness.error.message : null;

  const explanationId = React.useId();

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={ready}
        aria-label="Ready to debate this claim"
        aria-describedby={explanation ? explanationId : undefined}
        aria-busy={setReadiness.isPending || undefined}
        disabled={disabled}
        onClick={() =>
          setReadiness.mutate({
            spaceId: claim.space_id,
            claimId: claim.claim_entity_id,
            ready: !ready,
          })
        }
        className={cx(
          'flex h-6 shrink-0 items-center gap-1.5 text-footnote transition-colors disabled:opacity-50',
          ready ? 'text-text' : 'text-grey-04',
          !disabled && 'hover:text-text'
        )}
      >
        <Toggle checked={ready} className="shrink-0" />
        Debate
      </button>
      {/* Shown, not just a `title`: native tooltips never appear on touch and are unreliable on a
          disabled button, which is exactly when the explanation matters. */}
      {explanation ? (
        <span id={explanationId}>
          <Text as="span" variant="footnote" color="grey-04" className="block max-w-40 text-right">
            {explanation}
          </Text>
        </span>
      ) : null}
      {error ? (
        <div role="alert">
          <Text as="span" variant="footnote" color="red-01" className="block max-w-40 text-right">
            {error}
          </Text>
        </div>
      ) : null}
    </span>
  );
}
