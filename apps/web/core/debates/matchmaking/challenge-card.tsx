'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateChallenge } from '../api';
import { useAcceptDebateChallenge, useRejectDebateChallenge } from '../hooks';
import { type DebateAnalyticsSurface, debateActionAnalyticsAttributes } from './hub-analytics';
import { hubCardMotion } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
import { RequestParties } from './request-parties';
import { useRequestCountdown } from './use-request-countdown';

/**
 * A challenge's two answers, and the failure either left. Shared by this card and the panel's
 * Requests timeline (GEO-3463). `reject` is the recipient's dismiss and the requester's withdraw
 * alike: geo-chat has one endpoint for both.
 */
export function useIncomingChallengeActions(challenge: Pick<DebateChallenge, 'id'>) {
  const acceptChallenge = useAcceptDebateChallenge();
  const rejectChallenge = useRejectDebateChallenge();
  // Each `useMutation` call owns its own state, so only the actions this caller offers can set this
  // — the sender has no popup left to carry a failure, and the recipient's actions live here as
  // well as in theirs.
  const actionError = acceptChallenge.error ?? rejectChallenge.error;
  return {
    accept: () => acceptChallenge.mutate(challenge.id),
    reject: () => rejectChallenge.mutate(challenge.id),
    accepting: acceptChallenge.isPending,
    rejecting: rejectChallenge.isPending,
    busy: acceptChallenge.isPending || rejectChallenge.isPending,
    /** Announced with `role="alert"` wherever it is drawn. */
    error: actionError instanceof Error ? actionError.message : null,
  };
}

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
  analyticsSurface = 'hub',
}: {
  challenge: DebateChallenge;
  role: 'requester' | 'recipient';
  ref?: React.Ref<HTMLElement>;
  /** Whose clicks these are; the calendar shows this card too. */
  analyticsSurface?: DebateAnalyticsSurface;
}) {
  const { accept, reject, accepting, rejecting, busy, error } = useIncomingChallengeActions(challenge);
  const countdown = useRequestCountdown(challenge.expires_at);

  const isRecipient = role === 'recipient';
  const viewer = isRecipient ? challenge.recipient : challenge.requester;
  const opponent = isRecipient ? challenge.requester : challenge.recipient;

  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      {/* Top row: how long is left, and where this challenge stands. The state sits where the
          action for it sits, so the sender's Cancel rides along with "Awaiting response" rather
          than being stranded from the clock that makes it urgent. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex shrink-0 items-center gap-1 text-footnote text-text">
          <Time />
          {countdown.label}
        </span>

        {isRecipient ? (
          <Text as="span" variant="footnote" color="grey-04" className="truncate">
            Someone wants to debate you
          </Text>
        ) : (
          <span className="flex shrink-0 items-center gap-2 text-footnote text-grey-04">
            <span>Awaiting response</span>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={reject}
              disabled={busy}
              {...debateActionAnalyticsAttributes(analyticsSurface, 'Cancel request', 'cancel_debate_request')}
              className="shrink-0 text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
            >
              {rejecting ? 'Cancelling…' : 'Cancel request'}
            </button>
          </span>
        )}
      </div>

      {/* Claimless, so neither side holds a position to show. */}
      <RequestParties viewer={viewer} opponent={opponent} showPositions={false} />

      {/* Kept under the pairing they act on, unlike the sender's inline Cancel — these decide
          whether a debate happens, so they read after the two people rather than above them. */}
      {isRecipient ? (
        <div className="grid grid-cols-2 gap-2">
          <HubPillButton
            onClick={reject}
            disabled={busy}
            pending={rejecting}
            pendingLabel="Dismissing…"
          >
            Dismiss
          </HubPillButton>
          <HubPillButton
            variant="primary"
            onClick={accept}
            disabled={busy}
            pending={accepting}
            pendingLabel="Opening…"
          >
            Explore claims
          </HubPillButton>
        </div>
      ) : null}

      {error ? (
        // role="alert" so a failed action is announced, not just drawn under the button.
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {error}
          </Text>
        </div>
      ) : null}
    </motion.article>
  );
}
