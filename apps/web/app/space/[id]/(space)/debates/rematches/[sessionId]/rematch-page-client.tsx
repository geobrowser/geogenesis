'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import {
  type DebateRematchClaim,
  type DebateRematchRequest,
  type DebateRematchSession,
  getCurrentGeoChatUserId,
} from '~/core/debates/api';
import { DebateFormatDetails } from '~/core/debates/format-details';
import { DebateFormatSelector } from '~/core/debates/format-selector';
import { type DebateFormatId, defaultDebateFormatId } from '~/core/debates/formats';
import {
  useAcceptDebateRematchRequest,
  useCreateDebateRematchRequest,
  useDebate,
  useDebateRematch,
  useDebateRematchClaims,
  useLeaveDebateRematch,
  useRejectDebateRematchRequest,
  useUpdateDebateRematchPosition,
} from '~/core/debates/hooks';
import { useQueryEntities } from '~/core/sync/use-store';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { Text } from '~/design-system/text';

export function DebateRematchPageClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const currentUserId = getCurrentGeoChatUserId();
  const sessionQuery = useDebateRematch(sessionId);
  const [publishedClaimsCursor, setPublishedClaimsCursor] = React.useState<string | undefined>();
  const {
    entities: publishedClaimsPage,
    isLoading: publishedClaimsLoading,
    isPlaceholderData: publishedClaimsPlaceholder,
    endCursor: publishedClaimsEndCursor,
    hasNextPage: publishedClaimsHasNextPage,
  } = useQueryEntities({
    where: { types: [{ id: { equals: CLAIM_TYPE_ID } }] },
    first: 50,
    after: publishedClaimsCursor,
    placeholderData: keepPreviousData,
  });
  const [publishedClaims, setPublishedClaims] = React.useState<typeof publishedClaimsPage>([]);
  React.useEffect(() => {
    setPublishedClaims(current => {
      const next = new Map(current.map(claim => [claim.id, claim]));
      for (const claim of publishedClaimsPage) {
        if (!next.has(claim.id)) next.set(claim.id, claim);
      }
      return next.size === current.length ? current : [...next.values()];
    });
  }, [publishedClaimsPage]);
  const publishedClaimIds = React.useMemo(() => publishedClaims.map(claim => claim.id), [publishedClaims]);
  const savedClaimsQuery = useDebateRematchClaims(sessionId);
  const publishedClaimsQuery = useDebateRematchClaims(sessionId, publishedClaimIds);
  const updatePosition = useUpdateDebateRematchPosition(sessionId);
  const createRequest = useCreateDebateRematchRequest(sessionId);
  const leaveSession = useLeaveDebateRematch(sessionId);
  const leavingRef = React.useRef(false);
  const sessionStatusRef = React.useRef<DebateRematchSession['status'] | null>(null);
  const leaveMutationRef = React.useRef(leaveSession.mutate);
  leaveMutationRef.current = leaveSession.mutate;
  const acceptRequest = useAcceptDebateRematchRequest();
  const rejectRequest = useRejectDebateRematchRequest();
  const [formatByClaimId, setFormatByClaimId] = React.useState<Record<string, DebateFormatId>>({});
  const session = sessionQuery.data ?? null;
  sessionStatusRef.current = session?.status ?? null;
  const sourceDebateQuery = useDebate(session?.source_debate_id ?? '', Boolean(session?.source_debate_id));
  const claims = React.useMemo(() => {
    const synchronizedClaims = new Map(
      [...(savedClaimsQuery.data?.claims ?? []), ...(publishedClaimsQuery.data?.claims ?? [])].map(claim => [
        claim.claim.claim_entity_id,
        claim,
      ])
    );
    const excludedClaimIds = new Set([
      ...(savedClaimsQuery.data?.excluded_claim_ids ?? []),
      ...(publishedClaimsQuery.data?.excluded_claim_ids ?? []),
    ]);
    for (const claim of publishedClaims) {
      if (
        claim.name &&
        claim.spaces[0] &&
        !excludedClaimIds.has(claim.id) &&
        claim.id !== sourceDebateQuery.data?.claim.claim_entity_id &&
        !synchronizedClaims.has(claim.id)
      ) {
        synchronizedClaims.set(claim.id, {
          claim: {
            id: claim.id,
            space_id: claim.spaces[0]!,
            claim_entity_id: claim.id,
            claim: claim.name!,
            description: claim.description,
          },
          participants: (session?.participants ?? []).map(participant => ({
            user_id: participant.user_id,
            position: null,
          })),
          shared_preference: false,
          recently_rejected: false,
          previously_debated: false,
        });
      }
    }
    return [...synchronizedClaims.values()]
      .filter(claim => !excludedClaimIds.has(claim.claim.claim_entity_id))
      .sort((a, b) => Number(b.shared_preference) - Number(a.shared_preference));
  }, [
    publishedClaims,
    publishedClaimsQuery.data,
    savedClaimsQuery.data,
    session?.participants,
    sourceDebateQuery.data,
  ]);
  const remoteParticipant = session?.participants.find(participant => participant.user_id !== currentUserId) ?? null;
  const remoteName = remoteParticipant?.display_name || remoteParticipant?.profile_space_id || 'debater';

  React.useEffect(() => {
    if (!session) return;
    if (session.status === 'converted' && session.converted_debate_id) {
      router.replace(`/space/${session.source_space_id}/debates/${session.converted_debate_id}`);
    } else if (session.status === 'ended' || session.status === 'expired') {
      router.replace(`/space/${session.source_space_id}/debates`);
    }
  }, [router, session]);

  React.useEffect(
    () => () => {
      if (
        !leavingRef.current &&
        (sessionStatusRef.current === 'browsing' || sessionStatusRef.current === 'request_pending')
      ) {
        leaveMutationRef.current();
      }
    },
    []
  );

  const leave = () => {
    leavingRef.current = true;
    leaveSession.mutate(undefined, {
      onSuccess: ended => router.replace(`/space/${ended.source_space_id}/debates`),
    });
  };

  const pendingRequest = session?.status === 'request_pending' ? session.request : null;
  const incomingRequest = pendingRequest?.recipient_user_id === currentUserId ? pendingRequest : null;

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 py-8 sm:px-8">
        <header className="mb-6 flex items-center justify-between gap-4">
          <h1 className="min-w-0 truncate text-[1.5rem] leading-tight font-semibold">Rematch {remoteName}</h1>
          <Button type="button" variant="secondary" small onClick={leave} disabled={leaveSession.isPending}>
            Leave debate
          </Button>
        </header>

        {(sessionQuery.isLoading ||
          savedClaimsQuery.isLoading ||
          publishedClaimsQuery.isLoading ||
          publishedClaimsLoading) && <Text color="grey-04">Loading claims...</Text>}
        {(sessionQuery.error instanceof Error ||
          savedClaimsQuery.error instanceof Error ||
          publishedClaimsQuery.error instanceof Error) && (
          <Text color="red-01">
            {sessionQuery.error instanceof Error
              ? sessionQuery.error.message
              : savedClaimsQuery.error instanceof Error
                ? savedClaimsQuery.error.message
                : publishedClaimsQuery.error?.message}
          </Text>
        )}
        {(updatePosition.error instanceof Error ||
          createRequest.error instanceof Error ||
          leaveSession.error instanceof Error) && (
          <Text color="red-01" className="mb-4">
            {updatePosition.error instanceof Error
              ? updatePosition.error.message
              : createRequest.error instanceof Error
                ? createRequest.error.message
                : leaveSession.error instanceof Error
                  ? leaveSession.error.message
                  : null}
          </Text>
        )}

        <div className="grid gap-4">
          {claims.map(claim => (
            <RematchClaimCard
              key={claim.claim.claim_entity_id}
              claim={claim}
              session={session}
              currentUserId={currentUserId}
              formatId={formatByClaimId[claim.claim.claim_entity_id] ?? defaultDebateFormatId}
              onFormatChange={formatId =>
                setFormatByClaimId(current => ({ ...current, [claim.claim.claim_entity_id]: formatId }))
              }
              onPositionChange={position =>
                updatePosition.mutate({
                  claimId: claim.claim.claim_entity_id,
                  position,
                  sourceSpaceId: claim.claim.space_id,
                })
              }
              onRequest={() =>
                createRequest.mutate({
                  source_space_id: claim.claim.space_id,
                  claim_id: claim.claim.claim_entity_id,
                  format_id: formatByClaimId[claim.claim.claim_entity_id] ?? defaultDebateFormatId,
                })
              }
              busy={updatePosition.isPending || createRequest.isPending}
            />
          ))}
        </div>

        {!savedClaimsQuery.isLoading && !publishedClaimsQuery.isLoading && claims.length === 0 && (
          <div className="rounded-lg border border-grey-02 bg-white p-6 text-center">
            <Text color="grey-04">No other eligible claims are available yet.</Text>
          </div>
        )}
        {publishedClaimsHasNextPage && (
          <div className="mt-5 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (publishedClaimsEndCursor) setPublishedClaimsCursor(publishedClaimsEndCursor);
              }}
              disabled={publishedClaimsPlaceholder || !publishedClaimsEndCursor}
            >
              Load more
            </Button>
          </div>
        )}
      </main>

      {incomingRequest && session && (
        <RematchRequestDialog
          session={session}
          request={incomingRequest}
          currentUserId={currentUserId}
          busy={acceptRequest.isPending || rejectRequest.isPending}
          error={
            acceptRequest.error instanceof Error
              ? acceptRequest.error.message
              : rejectRequest.error instanceof Error
                ? rejectRequest.error.message
                : null
          }
          onAccept={() => acceptRequest.mutate(incomingRequest.id)}
          onReject={() => rejectRequest.mutate(incomingRequest.id)}
        />
      )}
    </div>
  );
}

function RematchClaimCard({
  claim,
  session,
  currentUserId,
  formatId,
  onFormatChange,
  onPositionChange,
  onRequest,
  busy,
}: {
  claim: DebateRematchClaim;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  formatId: DebateFormatId;
  onFormatChange: (formatId: DebateFormatId) => void;
  onPositionChange: (position: boolean) => void;
  onRequest: () => void;
  busy: boolean;
}) {
  const localPosition = claim.participants.find(position => position.user_id === currentUserId)?.position ?? null;
  const remotePosition = claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null;
  const localParticipant = session?.participants.find(participant => participant.user_id === currentUserId) ?? null;
  const remoteParticipant = session?.participants.find(participant => participant.user_id !== currentUserId) ?? null;
  const opposing = localPosition !== null && remotePosition !== null && localPosition !== remotePosition;
  const request = session?.request;
  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-5">
      <Text as="div" variant="metadata" color="grey-04">
        {claim.shared_preference ? 'You both picked a side' : 'More claims'}
      </Text>
      <h2 className="mt-2 text-[1.125rem] leading-snug font-semibold">{claim.claim.claim}</h2>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {[true, false].map(position => {
          const localOnPosition = localPosition === position;
          const remoteOnPosition = remotePosition === position;
          return (
            <button
              key={String(position)}
              type="button"
              onClick={() => onPositionChange(position)}
              disabled={busy || requesting}
              className={cx(
                'flex min-h-11 items-center justify-between rounded-full px-4 text-button transition-colors disabled:opacity-60',
                localOnPosition ? 'bg-green text-text' : 'bg-bg text-text'
              )}
            >
              <span>{position ? 'Yes' : 'No'}</span>
              <span className="flex -space-x-1">
                {localOnPosition && localParticipant && (
                  <Avatar avatarUrl={localParticipant.avatar_cid} value={localParticipant.profile_space_id} size={22} />
                )}
                {remoteOnPosition && remoteParticipant && (
                  <Avatar
                    avatarUrl={remoteParticipant.avatar_cid}
                    value={remoteParticipant.profile_space_id}
                    size={22}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <DebateFormatSelector
          value={formatId}
          canChoose
          disabled={busy || requesting}
          onChange={onFormatChange}
          name={`rematch-format-${claim.claim.claim_entity_id}`}
          className="sm:w-[240px]"
        />
        <Button
          type="button"
          onClick={onRequest}
          disabled={!opposing || busy || requesting || claim.recently_rejected}
          className="flex-1"
        >
          {requesting ? 'Requesting...' : 'Request debate'}
        </Button>
      </div>
      {claim.recently_rejected && (
        <Text as="p" variant="metadata" color="grey-04" className="mt-3 text-center">
          Recently rejected
        </Text>
      )}
    </article>
  );
}

function RematchRequestDialog({
  session,
  request,
  currentUserId,
  busy,
  error,
  onAccept,
  onReject,
}: {
  session: DebateRematchSession;
  request: DebateRematchRequest;
  currentUserId: string | null;
  busy: boolean;
  error: string | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const requester = session.participants.find(participant => participant.user_id === request.requester_user_id)!;
  const recipient = session.participants.find(participant => participant.user_id === request.recipient_user_id)!;
  const ordered = [recipient, requester];

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center overflow-y-auto bg-text/45 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rematch-request-title"
        className="w-[min(620px,100%)] rounded-xl bg-bg p-6 shadow-card"
      >
        <Text as="div" variant="body" color="grey-04" className="text-center">
          Debate request
        </Text>
        <h2
          id="rematch-request-title"
          className="mx-auto mt-2 max-w-[500px] text-center text-[1.6rem] leading-[1.12] font-semibold"
        >
          {request.claim.claim}
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-grey-02 bg-white p-4">
          {ordered.map(participant => {
            const isRequester = participant.user_id === request.requester_user_id;
            const position = isRequester ? request.requester_position : request.recipient_position;
            return (
              <div key={participant.user_id} className="grid justify-items-center gap-2 text-center">
                <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={32} />
                <Text variant="body">
                  {participant.user_id === currentUserId
                    ? 'You'
                    : participant.display_name || participant.profile_space_id}
                </Text>
                <span className="rounded-full bg-grey-02 px-3 py-1 text-metadataMedium">{position ? 'Yes' : 'No'}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg border border-grey-02 bg-white px-4 py-3">
          <Text variant="metadata" color="grey-04">
            Debate format
          </Text>
          <div className="mt-3">
            <DebateFormatDetails
              formatId={request.turn_format_id}
              participants={[requester, recipient]}
              currentUserId={currentUserId ?? ''}
            />
          </div>
        </div>
        {error && (
          <Text color="red-01" className="mt-3">
            {error}
          </Text>
        )}
        <div className="mt-5 grid gap-2">
          <Button type="button" onClick={onAccept} disabled={busy}>
            Accept
          </Button>
          <button
            type="button"
            onClick={onReject}
            disabled={busy}
            className="mx-auto min-h-10 px-5 text-button text-grey-04 hover:text-text disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      </section>
    </div>
  );
}
