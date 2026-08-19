'use client';

import * as React from 'react';

import cx from 'classnames';

import { Text } from '~/design-system/text';
import { Toggle } from '~/design-system/toggle';

import type { DebateClaimSummary, MatchmakingReadiness } from '../api';
import { readinessReasonMessage, useClaimDebateReadiness } from '../use-claim-debate-readiness';

type Props = {
  claim: DebateClaimSummary;
  readiness: MatchmakingReadiness;
  /** A claim already being debated can't take new readiness. */
  activeDebate?: boolean;
};

/**
 * Readiness is the half of matchmaking the hub owns — the position underneath it is an on-chain
 * claim response. So this can always stand you down, but it can only stand you up on a claim you
 * have responded to.
 *
 * Same control as the one on a claim's entity page: a click moves the switch now and
 * {@link useClaimDebateReadiness} holds the queue request until geo-chat can see the response.
 * The hub used to disable itself and say "Publishing your response…" for the minute or so that
 * took, which made standing ready a second trip back to a claim you had just taken a side on.
 */
export function ClaimReadinessToggle({ claim, readiness, activeDebate }: Props) {
  const {
    checked: ready,
    disabled,
    isSaving,
    error,
    viewerPosition,
    toggle,
  } = useClaimDebateReadiness({
    readiness,
    entityId: claim.claim_entity_id,
    spaceId: claim.space_id,
    canEnable: !activeDebate,
  });

  // `readiness_disabled_reason` explains why readiness is currently off; it never blocks turning
  // it back on. Standing yourself down reports `user_disabled`, which the mapper drops entirely —
  // treating it as a blocker would make standing down a one-way door.
  const explanation = ready
    ? undefined
    : activeDebate
      ? 'This claim is being debated right now.'
      : viewerPosition === null
        ? 'Respond to this claim to debate it.'
        : (readinessReasonMessage(readiness.readiness_disabled_reason) ?? undefined);

  const explanationId = React.useId();

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={ready}
        aria-label="Ready to debate this claim"
        aria-describedby={explanation ? explanationId : undefined}
        aria-busy={isSaving || undefined}
        disabled={disabled}
        onClick={toggle}
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
