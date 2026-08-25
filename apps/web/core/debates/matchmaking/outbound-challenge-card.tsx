'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateChallenge } from '../api';
import { useRejectDebateChallenge } from '../hooks';
import { hubCardMotion } from './hub-motion';
import { RequestParties } from './request-parties';
import { useRequestCountdown } from './use-request-countdown';

/**
 * The request you sent to a particular person, sitting above the People list the way
 * {@link OutboundRequestCard} sits above Matches.
 *
 * The same card as a claim request minus the two things a claimless challenge doesn't have: no
 * space chip and no claim, because you challenged a person rather than a position. What's left is
 * what a sent request is actually about — who you asked, and how long they have to answer.
 *
 * Cancelling is the same endpoint the recipient dismisses with — `rejectDebateChallenge` serves
 * both sides of a challenge — and is worded the way the Requests tab already words it, since it is
 * the same action on the same object two tabs over.
 */
export function OutboundChallengeCard({
  challenge,
  ref,
}: {
  challenge: DebateChallenge;
  ref?: React.Ref<HTMLElement>;
}) {
  const cancelChallenge = useRejectDebateChallenge();
  const countdown = useRequestCountdown(challenge.expires_at);

  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      {/* The countdown keeps the header's right edge, where both request cards put it — there is
          just no space chip on its left to balance it. */}
      <div className="flex items-center justify-end gap-2">
        <span className="flex shrink-0 items-center gap-1 text-footnote text-text">
          <Time />
          {countdown.label}
        </span>
      </div>

      {/* Claimless, so neither side holds a position to show. */}
      <RequestParties viewer={challenge.requester} opponent={challenge.recipient} showPositions={false} />

      {/* Its own row under the two sides, where the claim card puts it. */}
      <span className="flex items-center justify-center gap-2 text-footnote text-grey-04">
        <span>Awaiting response</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          onClick={() => cancelChallenge.mutate(challenge.id)}
          disabled={cancelChallenge.isPending}
          className="shrink-0 text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
        >
          {cancelChallenge.isPending ? 'Cancelling…' : 'Cancel request'}
        </button>
      </span>

      {cancelChallenge.error instanceof Error ? (
        // role="alert" so a failed cancel is announced rather than only drawn under the button.
        <div role="alert">
          <Text as="p" variant="footnote" color="red-01">
            {cancelChallenge.error.message}
          </Text>
        </div>
      ) : null}
    </motion.article>
  );
}
