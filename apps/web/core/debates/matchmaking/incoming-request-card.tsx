'use client';

import * as React from 'react';

import { Time } from '~/design-system/icons/time';

import type { DebateRequest } from '../api';
import { speakerLabel } from '../playback-utils';
import { useAcceptDebateRequest, useBlockDebateUser, useDismissDebateRequest } from './hooks';
import { SpaceChip } from './matchmaking-claim-card';
import { RequestOverflowMenu } from './request-overflow-menu';
import { RequestParties } from './request-parties';
import { useRequestCountdown } from './use-request-countdown';

/**
 * A request someone sent you. Dismissing behaves exactly like letting it expire for you, and frees
 * the request to advance to the next candidate on the server.
 */
export function IncomingRequestCard({ request }: { request: DebateRequest }) {
  const countdown = useRequestCountdown(request.expires_at);
  const acceptRequest = useAcceptDebateRequest();
  const dismissRequest = useDismissDebateRequest();
  const blockUser = useBlockDebateUser();

  const busy = acceptRequest.isPending || dismissRequest.isPending || blockUser.isPending;
  const unavailable = request.requester.in_debate;

  // Expiry is server-driven, but hiding it locally avoids a dead card between tick and event.
  if (countdown.expired) return null;

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        <span className="flex shrink-0 items-center gap-1 text-footnote text-grey-04">
          <Time />
          {countdown.label}
        </span>
      </div>

      <p className="mb-3 text-metadataMedium">{request.claim.claim}</p>

      <div className="relative">
        <RequestParties viewer={request.recipient} opponent={request.requester} />
        <div className="absolute top-1.5 right-1.5">
          <RequestOverflowMenu
            actions={[
              {
                label: "I don't want to debate this claim",
                onClick: () => dismissRequest.mutate({ requestId: request.id, removeIntent: true }),
              },
              {
                label: `Block ${speakerLabel(request.requester)}`,
                destructive: true,
                onClick: () => blockUser.mutate(request.requester.user_id),
              },
            ]}
          />
        </div>
      </div>

      {unavailable ? (
        <p className="mt-2 text-footnote text-grey-04">
          {speakerLabel(request.requester)} is in a debate. You can accept once they’re free.
        </p>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => dismissRequest.mutate({ requestId: request.id })}
          disabled={busy}
          className="h-8 rounded-full border border-grey-02 text-metadata transition-colors hover:bg-grey-01 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => acceptRequest.mutate({ requestId: request.id })}
          disabled={busy || unavailable}
          className="h-8 rounded-full bg-text text-metadata text-white transition-colors hover:bg-text/90 disabled:opacity-50"
        >
          {unavailable ? 'Pending' : 'Accept'}
        </button>
      </div>
    </article>
  );
}
