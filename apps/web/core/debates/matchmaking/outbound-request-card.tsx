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
import { useRequestCountdown } from './use-request-countdown';

/**
 * The request you sent, listed under "Sent". Only one may be open at a time, so withdrawing is how
 * you free yourself to ask someone else — which is why it's a visible action rather than something
 * behind a menu.
 *
 * The countdown sits where `IncomingRequestCard` puts it. A request expires 25 minutes after it was
 * sent whether or not anyone looks at it, and until this was here the sent side was the one place
 * that clock ran invisibly — you couldn't tell a request that had just gone out from one about to
 * lapse, which is exactly when you'd want to withdraw and ask someone else instead.
 */
export function OutboundRequestCard({ request, ref }: { request: DebateRequest; ref?: React.Ref<HTMLElement> }) {
  const withdrawRequest = useWithdrawDebateRequest();
  const countdown = useRequestCountdown(request.expires_at);

  return (
    <motion.article
      ref={ref}
      {...hubCardMotion}
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        <span className="flex shrink-0 items-center gap-1 text-footnote text-text">
          <Time />
          {countdown.label}
        </span>
      </div>

      <Text as="p" variant="metadataMedium">
        {request.claim.claim}
      </Text>

      {/* The viewer is the requester on their own outbound request. */}
      <RequestParties viewer={request.requester} opponent={request.recipient} />

      {/* Its own row rather than crowding the header, which now carries the countdown — and it's
          where the design puts it, under the two sides. */}
      <span className="flex items-center justify-center gap-2 text-footnote text-grey-04">
        <span>Awaiting response</span>
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
    </motion.article>
  );
}
