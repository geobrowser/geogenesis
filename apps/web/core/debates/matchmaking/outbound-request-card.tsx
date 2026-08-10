'use client';

import * as React from 'react';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateRequest } from '../api';
import { useWithdrawDebateRequest } from './hooks';
import { SpaceChip } from './matchmaking-claim-card';
import { useRequestCountdown } from './use-request-countdown';

/**
 * The awaiting-response card. Pinned above the Matches list because only one outbound request may
 * be open at a time — withdrawing is how you free yourself to request someone else.
 */
export function OutboundRequestCard({ request }: { request: DebateRequest }) {
  const countdown = useRequestCountdown(request.expires_at);
  const withdrawRequest = useWithdrawDebateRequest();

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        <span className="flex min-w-0 items-center gap-2 text-footnote text-grey-04">
          <span className="flex shrink-0 items-center gap-1">
            <Time />
            {/* The label is the least useful part of the row on a narrow sheet — the countdown
                below already says what's happening, so let it go before the space name does. */}
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
      <Text as="p" variant="metadataMedium" className="mb-2">
        {request.claim.claim}
      </Text>
      <Text as="p" variant="footnote" color="grey-04">
        {countdown.label}
      </Text>
    </article>
  );
}
