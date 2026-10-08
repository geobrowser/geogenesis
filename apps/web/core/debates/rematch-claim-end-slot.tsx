'use client';

import * as React from 'react';

import { useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { equals as idEquals } from '~/core/id/normalize';
import { CLAIM_RESPONSE_KIND } from '~/core/responses/entity-response';

import { defaultDebateFormatId } from './formats';
import { useDebateRematchClaims } from './hooks';
import type { RematchPanelContext } from './rematch-panel-context';
import { RematchRequestControl } from './rematch-request-control';

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
  const rejected = row?.recently_rejected || session?.recently_rejected_claim_ids.some(id => idEquals(id, claimId));
  const isCurrentRequest = Boolean(
    createRequest.variables &&
    idEquals(createRequest.variables.claim_id, claimId) &&
    idEquals(createRequest.variables.source_space_id, spaceId)
  );
  const error = isCurrentRequest && createRequest.error instanceof Error ? createRequest.error.message : null;

  if (
    !enabled ||
    !currentUserId ||
    !session ||
    !session.participants.some(person => idEquals(person.user_id, currentUserId)) ||
    !row ||
    !canPublishDebateIn(spaceId) ||
    data?.excluded_claim_ids.some(id => idEquals(id, claimId))
  )
    return null;
  return (
    <RematchRequestControl
      session={session}
      claimId={claimId}
      chatPosition={chatPosition}
      localPosition={localPosition}
      remotePosition={remotePosition}
      opponentPresent={opponentPresent}
      indexingDelayed={indexing.status === 'delayed'}
      busy={createRequest.isPending}
      recentlyRejected={Boolean(rejected)}
      previouslyDebated={row.previously_debated}
      onRequest={() => {
        createRequest.mutate({ source_space_id: spaceId, claim_id: claimId, format_id: defaultDebateFormatId });
      }}
      isSending={createRequest.isPending && isCurrentRequest}
      requestError={error}
      variant={variant}
      className={className}
    />
  );
}
