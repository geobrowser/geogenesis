'use client';

import * as React from 'react';

import { motion } from 'framer-motion';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

import type { DebateRequest } from '../api';
import { speakerLabel } from '../playback-utils';
import { useAcceptDebateRequest, useBlockDebateUser, useDismissDebateRequest } from './hooks';
import { hubCardMotion } from './hub-motion';
import { HubPillButton } from './hub-pill-button';
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

  return (
    // Expiry is owned by the list (`useUnexpiredRequests`) rather than this card, so the card can
    // animate out instead of vanishing mid-frame.
    <motion.article {...hubCardMotion} className="w-full rounded-lg border border-grey-02 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        <span className="flex shrink-0 items-center gap-1 text-footnote text-grey-04">
          <Time />
          {countdown.label}
          {/* Sits with the other header affordances rather than floating over the participants
              card, where it collided with longer display names. */}
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
        </span>
      </div>

      <Text as="p" variant="metadataMedium" className="mb-3">
        {request.claim.claim}
      </Text>

      <RequestParties viewer={request.recipient} opponent={request.requester} />

      {unavailable ? (
        <Text as="p" variant="footnote" color="grey-04" className="mt-2">
          {speakerLabel(request.requester)} is in a debate. You can accept once they’re free.
        </Text>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <HubPillButton
          onClick={() => dismissRequest.mutate({ requestId: request.id })}
          disabled={busy}
          pending={dismissRequest.isPending}
          pendingLabel="Dismissing…"
        >
          Dismiss
        </HubPillButton>
        <HubPillButton
          variant="primary"
          onClick={() => acceptRequest.mutate({ requestId: request.id })}
          disabled={busy || unavailable}
          pending={acceptRequest.isPending}
          pendingLabel="Accepting…"
        >
          {unavailable ? 'Pending' : 'Accept'}
        </HubPillButton>
      </div>
    </motion.article>
  );
}
