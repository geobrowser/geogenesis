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
import { type RequestOverflowAction, RequestOverflowMenu } from './request-overflow-menu';
import { RequestParties } from './request-parties';
import { useAnswerOnce } from './use-answer-once';
import { useRequestCountdown } from './use-request-countdown';

/**
 * Everything a request sent to the viewer can be answered with: Accept, Dismiss (the timeline's
 * "Not now", which spends the request the same way), and the "…" menu's two. Shared by this card and
 * the panel's Requests timeline (GEO-3463), so the two cannot answer one request differently.
 */
export function useIncomingRequestActions(request: DebateRequest) {
  const acceptRequest = useAcceptDebateRequest();
  const dismissRequest = useDismissDebateRequest();
  const blockUser = useBlockDebateUser();
  const { answerOnce, releaseAnswer } = useAnswerOnce();

  const overflowActions: RequestOverflowAction[] = [
    {
      // Guarded like the buttons: this is the same dismiss endpoint they use, so an answer already
      // taken would 409 here.
      label: "I don't want to debate this claim",
      analyticsLabel: 'Remove claim request intent',
      onClick: () =>
        answerOnce(() => dismissRequest.mutate({ requestId: request.id, removeIntent: true }, releaseAnswer)),
    },
    {
      // Deliberately outside the guard. Blocking writes the viewer's block list
      // (`PUT /me/debate-blocks/{userId}`) rather than answering this request, so it cannot collide
      // with one — and gating it would let an answer already taken swallow a safety action, which is
      // the worse failure by far.
      label: `Block ${speakerLabel(request.requester)}`,
      analyticsLabel: 'Block requester',
      destructive: true,
      onClick: () => blockUser.mutate(request.requester.user_id),
    },
  ];

  return {
    accept: () => answerOnce(() => acceptRequest.mutate({ requestId: request.id }, releaseAnswer)),
    dismiss: () => answerOnce(() => dismissRequest.mutate({ requestId: request.id }, releaseAnswer)),
    accepting: acceptRequest.isPending,
    dismissing: dismissRequest.isPending,
    busy: acceptRequest.isPending || dismissRequest.isPending || blockUser.isPending,
    /** The requester is in another debate: it can be accepted once they are free. */
    unavailable: request.requester.in_debate,
    overflowActions,
  };
}

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
  const { accept, dismiss, accepting, dismissing, busy, unavailable, overflowActions } =
    useIncomingRequestActions(request);

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
        overflow={<RequestOverflowMenu analyticsSurface="hub" actions={overflowActions} />}
      />

      {unavailable ? (
        <Text as="p" variant="footnote" color="grey-04">
          {speakerLabel(request.requester)} is in a debate. You can accept once they’re free.
        </Text>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <HubPillButton onClick={dismiss} disabled={busy} pending={dismissing} pendingLabel="Dismissing…">
          Dismiss
        </HubPillButton>
        <HubPillButton
          variant="primary"
          onClick={accept}
          disabled={busy || unavailable}
          pending={accepting}
          pendingLabel="Accepting…"
        >
          {unavailable ? 'Pending' : 'Accept'}
        </HubPillButton>
      </div>
    </motion.article>
  );
}
