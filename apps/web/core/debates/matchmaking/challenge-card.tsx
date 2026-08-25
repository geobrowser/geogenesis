'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateChallenge } from '../api';
import { useAcceptDebateChallenge, useRejectDebateChallenge } from '../hooks';
import { hubCardMotion } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
import { RequestParties } from './request-parties';
import { useRequestCountdown } from './use-request-countdown';

/**
 * A challenge you sent or received, wherever it is shown — above the People list, and under Sent
 * and Received in the Requests tab.
 *
 * The same card a claim request gets, minus the two things a claimless challenge doesn't have: no
 * space chip and no claim, because a person was challenged rather than a position. What's left is
 * who is involved, how long is left, and what can be done about it.
 *
 * Both roles cancel through `rejectDebateChallenge` — the recipient dismisses with it, the
 * requester withdraws with it. It is worded per role, since dismissing someone else's request and
 * taking back your own are not the same act.
 */
export function DebateChallengeCard({
  challenge,
  role,
  ref,
}: {
  challenge: DebateChallenge;
  role: 'requester' | 'recipient';
  ref?: React.Ref<HTMLElement>;
}) {
  const acceptChallenge = useAcceptDebateChallenge();
  const rejectChallenge = useRejectDebateChallenge();
  const countdown = useRequestCountdown(challenge.expires_at);

  const isRecipient = role === 'recipient';
  const viewer = isRecipient ? challenge.recipient : challenge.requester;
  const opponent = isRecipient ? challenge.requester : challenge.recipient;
  const busy = acceptChallenge.isPending || rejectChallenge.isPending;
  // Each `useMutation` call owns its own state, so only the action this card actually offers can
  // set this — the sender has no popup left to carry a failure, and the recipient's actions live
  // here as well as in theirs.
  const actionError = acceptChallenge.error ?? rejectChallenge.error;

  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      {isRecipient ? (
        <Text as="span" variant="footnoteMedium" color="grey-04" className="truncate">
          Someone wants to debate you
        </Text>
      ) : null}

      {/* Claimless, so neither side holds a position to show. */}
      <RequestParties viewer={viewer} opponent={opponent} showPositions={false} />

      {/* One row: how long is left on the left, what you can do about it on the right. It wraps
          rather than overflows, since the recipient's two buttons are wider than the panel on the
          narrowest layouts. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1 text-footnote text-text">
          <Time />
          {countdown.label}
        </span>

        {isRecipient ? (
          <span className="flex shrink-0 items-center gap-2">
            <HubPillButton
              onClick={() => rejectChallenge.mutate(challenge.id)}
              disabled={busy}
              pending={rejectChallenge.isPending}
              pendingLabel="Dismissing…"
            >
              Dismiss
            </HubPillButton>
            <HubPillButton
              variant="primary"
              onClick={() => acceptChallenge.mutate(challenge.id)}
              disabled={busy}
              pending={acceptChallenge.isPending}
              pendingLabel="Opening…"
            >
              Explore claims
            </HubPillButton>
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-2 text-footnote text-grey-04">
            <span>Awaiting response</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => rejectChallenge.mutate(challenge.id)}
              disabled={busy}
              className="shrink-0 text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
            >
              {rejectChallenge.isPending ? 'Cancelling…' : 'Cancel request'}
            </button>
          </span>
        )}
      </div>

      {actionError instanceof Error ? (
        // role="alert" so a failed action is announced, not just drawn under the button.
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {actionError.message}
          </Text>
        </div>
      ) : null}
    </motion.article>
  );
}
