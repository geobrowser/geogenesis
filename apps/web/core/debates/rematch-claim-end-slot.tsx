'use client';

import * as React from 'react';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { equals as idEquals } from '~/core/id/normalize';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

import { defaultDebateFormatId } from './formats';
import { useDebateRematchClaims } from './hooks';
import type { RematchPanelContext } from './rematch-panel-context';
import { RequestDebateControl } from './request-debate-control';
import { debateRequestGate } from './request-gate';
import { ROOM_REQUEST_WAITING } from './rooms/room-copy';

export function RematchClaimEndSlot({
  context,
  claimId,
  spaceId,
  viewerPosition,
  enabled = true,
  variant,
  className,
}: {
  context: RematchPanelContext;
  claimId: string;
  spaceId: string;
  viewerPosition: boolean | null | undefined;
  enabled?: boolean;
  variant?: 'inline' | 'block';
  className?: string;
}) {
  const { sessionId, session, currentUserId, opponentPresent, canPublishDebateIn, createRequest } = context;
  const claimIds = React.useMemo(() => [claimId], [claimId]);
  const { data } = useDebateRematchClaims(sessionId, claimIds, enabled);
  const indexing = useEntityResponseIndexingSnapshot({ entityId: claimId, spaceId, responseKind: CLAIM_RESPONSE_KIND });
  const row = data?.claims.find(
    row => idEquals(row.claim.claim_entity_id, claimId) && idEquals(row.claim.space_id, spaceId)
  );
  const opponent = session?.participants.find(person => currentUserId && !idEquals(person.user_id, currentUserId));
  const remotePosition =
    row?.participants.find(person => opponent && idEquals(person.user_id, opponent.user_id))?.position ?? null;
  const chatPosition =
    row?.viewer_position !== undefined
      ? row.viewer_position
      : row?.participants.find(person => currentUserId && idEquals(person.user_id, currentUserId))?.position;
  const pendingResponse = indexing.pending?.expectedResponse;
  const localPosition =
    pendingResponse !== undefined
      ? pendingResponse === null
        ? null
        : pendingResponse === 'positive'
      : viewerPosition !== undefined
        ? viewerPosition
        : (chatPosition ?? null);
  const gate = debateRequestGate({
    chatPosition,
    localPosition,
    opponentReady: localPosition !== null && remotePosition !== null && localPosition !== remotePosition,
    opponentPresent,
    indexingDelayed: indexing.status === 'delayed',
  });
  const rejected = row?.recently_rejected || session?.recently_rejected_claim_ids.some(id => idEquals(id, claimId));
  const requesting =
    session?.status === 'request_pending' &&
    session.request &&
    idEquals(session.request.claim.claim_entity_id, claimId);
  const error =
    createRequest.error instanceof Error &&
    createRequest.variables &&
    idEquals(createRequest.variables.claim_id, claimId)
      ? createRequest.error.message
      : null;

  if (
    !enabled ||
    !currentUserId ||
    !session ||
    !session.participants.some(person => idEquals(person.user_id, currentUserId)) ||
    !row ||
    !canPublishDebateIn(spaceId) ||
    data?.excluded_claim_ids.some(id => idEquals(id, claimId)) ||
    !['browsing', 'request_pending'].includes(session.status)
  )
    return null;
  if (!gate.canRequest && !gate.pending && !gate.awaitingOpponent && !requesting && !rejected && !error) return null;

  const note = rejected ? 'Recently rejected' : gate.awaitingOpponent ? ROOM_REQUEST_WAITING : null;
  const disabled =
    !gate.canRequest || createRequest.isPending || session.status === 'request_pending' || Boolean(rejected);
  return (
    <RequestDebateControl
      onRequest={() => {
        if (disabled) return;
        createRequest.mutate({ source_space_id: spaceId, claim_id: claimId, format_id: defaultDebateFormatId });
      }}
      disabled={disabled}
      isRequesting={
        Boolean(requesting) ||
        (createRequest.isPending &&
          Boolean(createRequest.variables && idEquals(createRequest.variables.claim_id, claimId)))
      }
      pending={gate.pending}
      pendingLabel={gate.pendingLabel}
      requestError={error}
      note={note ? <span className="text-footnote text-grey-04">{note}</span> : null}
      variant={variant}
      className={className}
    />
  );
}
