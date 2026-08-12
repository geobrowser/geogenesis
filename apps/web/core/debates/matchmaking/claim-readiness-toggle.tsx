'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { readinessReasonMessage } from '../claim-debate-readiness';
import { useClaimReadiness } from './hooks';

type Props = {
  claim: DebateClaimSummary;
  readiness: MatchmakingReadiness;
  /** A claim already being debated can't take new readiness. */
  activeDebate?: boolean;
  /**
   * Whether the viewer has a response as *this client* sees it. geo-chat only learns about a
   * response once it has been published and indexed, so its own copy lags — trusting it alone
   * leaves the toggle dead for someone who has just responded.
   */
  hasResponse: boolean;
  /** A response is still being published or indexed. */
  responseIndexing?: boolean;
};

/**
 * Readiness is the half of matchmaking the hub owns — the position underneath it is an on-chain
 * claim response. So this can always stand you down, but it can only stand you up on a claim you
 * have responded to.
 */
export function ClaimReadinessToggle({ claim, readiness, activeDebate, hasResponse, responseIndexing }: Props) {
  const setReadiness = useClaimReadiness();

  const ready = readiness.viewer_debate_ready;
  // Offer the toggle as soon as the viewer has responded. If geo-chat hasn't caught up it rejects
  // the request and says so, which beats a dead control with no explanation.
  const canTurnOn = hasResponse && !activeDebate && !responseIndexing;
  const disabled = setReadiness.isPending || (!ready && !canTurnOn);

  // `readiness_disabled_reason` explains why readiness is currently off; it never blocks turning
  // it back on. Standing yourself down reports `user_disabled`, which the mapper drops entirely —
  // treating it as a blocker would make standing down a one-way door.
  const explanation = ready
    ? undefined
    : activeDebate
      ? 'This claim is being debated right now.'
      : responseIndexing
        ? 'Publishing your response…'
        : !hasResponse
          ? 'Respond to this claim to debate it.'
          : (readinessReasonMessage(readiness.readiness_disabled_reason) ?? undefined);
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
          // `min-h-4` matches the space chip's avatar so the two sit on one line in the card header.
          // Per the design the label is grey whether or not readiness is on — the switch alone
          // carries that signal. Hover still darkens it, as the affordance that it's clickable.
          'flex min-h-4 shrink-0 items-center gap-2 text-footnoteMedium text-grey-04 transition-colors disabled:opacity-50',
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
