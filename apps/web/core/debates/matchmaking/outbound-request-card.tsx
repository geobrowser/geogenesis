'use client';

import * as React from 'react';

import { Time } from '~/design-system/icons/time';

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
        <span className="flex shrink-0 items-center gap-2 text-footnote text-grey-04">
          <span className="flex items-center gap-1">
            <Time />
            Awaiting response
          </span>
          <span aria-hidden>·</span>
          <button
            type="button"
            onClick={() => withdrawRequest.mutate(request.id)}
            disabled={withdrawRequest.isPending}
            className="text-text underline transition-colors hover:text-grey-04 disabled:opacity-50"
          >
            Withdraw
          </button>
        </span>
      </div>
      <p className="mb-1 text-metadataMedium">{request.claim.claim}</p>
      <p className="text-footnote text-grey-04">{countdown.label}</p>
    </article>
  );
}
