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
import { useAnswerOnce } from './use-answer-once';
import { useRequestCountdown } from './use-request-countdown';

/**
 * A request someone sent you, listed under "Received" for its full lifetime. Turning it down here
 * behaves exactly like letting it expire for you, and frees the request to advance to the next
 * candidate on the server — unlike the popup's "Not now", which only closes the popup.
 *
 * Hence "Dismiss" rather than the popup's wording: the two used to share a label while doing
 * opposite things, and this is the one that spends the request.
 */
export function IncomingRequestCard({ request, ref }: { request: DebateRequest; ref?: React.Ref<HTMLElement> }) {
  const countdown = useRequestCountdown(request.expires_at);
  const acceptRequest = useAcceptDebateRequest();
  const dismissRequest = useDismissDebateRequest();
  const blockUser = useBlockDebateUser();

  const busy = acceptRequest.isPending || dismissRequest.isPending || blockUser.isPending;
  const unavailable = request.requester.in_debate;
  const { answerOnce } = useAnswerOnce();

  return (
    // Expiry is owned by the list (`useUnexpiredRequests`) rather than this card, so the card can
    // animate out instead of vanishing mid-frame.
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

      {/* The "…" sits at the end of the opponent's side, where the design puts it. Both names
          truncate around it rather than colliding with it. */}
      <RequestParties
        viewer={request.recipient}
        opponent={request.requester}
        overflow={
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
        }
      />

      {unavailable ? (
        <Text as="p" variant="footnote" color="grey-04">
          {speakerLabel(request.requester)} is in a debate. You can accept once they’re free.
        </Text>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <HubPillButton
          onClick={() => answerOnce(() => dismissRequest.mutate({ requestId: request.id }))}
          disabled={busy}
          pending={dismissRequest.isPending}
          pendingLabel="Dismissing…"
        >
          Dismiss
        </HubPillButton>
        <HubPillButton
          variant="primary"
          onClick={() => answerOnce(() => acceptRequest.mutate({ requestId: request.id }))}
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
