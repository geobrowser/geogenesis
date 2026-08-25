'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateChallenge } from '../api';
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
 * No Withdraw, unlike the claim version. geo-chat exposes create, accept and reject on a
 * challenge; reject belongs to the recipient, and there is no requester-side cancel to call. The
 * countdown is the honest answer in the meantime — it expires on its own.
 */
export function OutboundChallengeCard({
  challenge,
  ref,
}: {
  challenge: DebateChallenge;
  ref?: React.Ref<HTMLElement>;
}) {
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

      <Text as="span" variant="footnote" color="grey-04" className="text-center">
        Awaiting response
      </Text>
    </motion.article>
  );
}
