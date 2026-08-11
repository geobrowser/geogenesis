'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateRequest } from '../api';
import { useWithdrawDebateRequest } from './hooks';
import { hubCardMotion } from './hub-motion';
import { SpaceChip } from './matchmaking-claim-card';
import { RequestParties } from './request-parties';

/**
 * The request you sent, listed under "Sent". Only one may be open at a time, so withdrawing is how
 * you free yourself to ask someone else — which is why it sits in the header rather than behind a
 * menu.
 */
export function OutboundRequestCard({ request }: { request: DebateRequest }) {
  const withdrawRequest = useWithdrawDebateRequest();

  return (
    <motion.article
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        <span className="flex min-w-0 items-center gap-2 text-footnote text-grey-04">
          <span className="flex shrink-0 items-center gap-1">
            <Time />
            {/* The label is the least useful part of the row on a narrow sheet — Withdraw next to
                it already says what state this is in, so let it go before the space name does. */}
            <span className="hidden sm:inline">Awaiting response</span>
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => withdrawRequest.mutate(request.id)}
            disabled={withdrawRequest.isPending}
            className="shrink-0 text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
          >
            {withdrawRequest.isPending ? 'Withdrawing…' : 'Withdraw'}
          </button>
        </span>
      </div>

      <Text as="p" variant="metadataMedium">
        {request.claim.claim}
      </Text>

      {/* The viewer is the requester on their own outbound request. */}
      <RequestParties viewer={request.requester} opponent={request.recipient} />
    </motion.article>
  );
}
