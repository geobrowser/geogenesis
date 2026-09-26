'use client';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';

import type { DebateRematchParticipant, DebateRematchRequest } from '~/core/debates/api';
import { hubCardMotion } from '~/core/debates/matchmaking/hub-motion';
import { SpaceChip } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { RequestParties } from '~/core/debates/matchmaking/request-parties';
import { useRequestCountdown } from '~/core/debates/matchmaking/use-request-countdown';
import { responsePositionLabel } from '~/core/responses/entity-response';

import { Time } from '~/design-system/icons/time';
import { Text } from '~/design-system/text';

/**
 * The request the viewer has sent from the claim picker, waiting on the other side.
 *
 * Built from the hub's pieces — `SpaceChip`, `RequestParties`, `useRequestCountdown` — rather than
 * reusing `OutboundRequestCard` itself, which takes a `DebateRequest` whose parties carry
 * matchmaking presence this session has no source for. Faking that to reach the component would be
 * a worse kind of reuse than sharing the parts it is made of.
 *
 * The one real difference from the hub's card: a rematch request cannot be withdrawn — geo-chat has
 * no endpoint for it — so this says what is happening and waits, rather than offering a way out
 * that does not exist.
 */
export function RematchRequestCard({
  request,
  participants,
  currentUserId,
}: {
  request: DebateRematchRequest;
  participants: readonly DebateRematchParticipant[];
  currentUserId: string;
}) {
  const countdown = useRequestCountdown(request.expires_at);

  // Each side as the parties row wants them: the person, plus the side they took on this claim.
  const parties = participants.map(participant => {
    const isRequester = participant.user_id === request.requester_user_id;
    const position = isRequester ? request.requester_position : request.recipient_position;

    return {
      ...participant,
      position,
      position_label: responsePositionLabel(position),
    };
  });

  const viewer = parties.find(party => party.user_id === currentUserId) ?? null;
  const opponent = parties.find(party => party.user_id !== currentUserId);
  if (!opponent) return null;

  return (
    <motion.article
      {...hubCardMotion}
      data-testid="rematch-outbound-request"
      className="flex w-full flex-col gap-3 rounded-lg border border-grey-02 bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <SpaceChip spaceId={request.claim.space_id} />
        {/* The clock is the only thing on this card that changes, and it is the reason to look at
            it twice: a request lapses on its own whether or not anyone is watching. */}
        <span
          className={cx(
            'flex shrink-0 items-center gap-1 text-footnote',
            countdown.expired ? 'text-red-01' : 'text-text'
          )}
        >
          <Time />
          {countdown.expired ? 'Expired' : countdown.label}
        </span>
      </div>

      <Text as="p" variant="metadataMedium">
        {request.claim.claim}
      </Text>

      <RequestParties viewer={viewer} opponent={opponent} />

      {/* The hub never draws an expired request — `useUnexpiredRequests` filters them out before its
          card sees one. Here the card is drawn from the session, which says `request_pending` until
          geo-chat's next answer, so the lapse is reachable and saying "Awaiting response" through it
          would be waiting on something that is over. */}
      <span className="flex items-center justify-center text-footnote text-grey-04">
        {countdown.expired ? 'This request has expired.' : 'Awaiting response'}
      </span>
    </motion.article>
  );
}
