'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import {
  type DebateRematchClaim,
  type DebateRematchParticipant,
  type DebateRematchRequest,
  type DebateRematchSession,
  getCurrentGeoChatUserId,
} from '~/core/debates/api';
import { DebateFormatDetails } from '~/core/debates/format-details';
import { defaultDebateFormatId } from '~/core/debates/formats';
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
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
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
  const acceptRequest = useAcceptDebateRematchRequest();
  const rejectRequest = useRejectDebateRematchRequest();
  const session = sessionQuery.data ?? null;
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
  const remoteParticipant =
    currentUserId === null
      ? null
      : (session?.participants.find(participant => participant.user_id !== currentUserId) ?? null);
  const remoteName = remoteParticipant?.display_name || remoteParticipant?.profile_space_id || 'debater';

  // The opponent is whichever participant isn't the local user; with no local user there is none.
  const opponentPositionOf = React.useCallback(
    (claim: DebateRematchClaim) =>
      currentUserId === null
        ? null
        : (claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null),
    [currentUserId]
  );

  // Topics live on the KG claim entity (not the rematch API), so resolve them here to
  // label each card and drive the "Any topic" filter — same as the join-a-debate panel.
  const topicByClaimId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of publishedClaims) {
      const topic = entity.relations.find(
        relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true
      );
      if (topic) map.set(entity.id, topic.toEntity.name ?? topic.toEntity.id);
    }
    return map;
  }, [publishedClaims]);

  const [tab, setTab] = React.useState<'all' | 'debate-now'>('all');
  const [topicFilter, setTopicFilter] = React.useState<string>('');

  // "Debate now" = claims the opponent has taken a position on; the tab badge counts them.
  const opponentPositionCount = React.useMemo(
    () => claims.filter(claim => opponentPositionOf(claim) !== null).length,
    [claims, opponentPositionOf]
  );

  const availableTopics = React.useMemo(() => {
    const topics = new Set<string>();
    for (const claim of claims) {
      const topic = topicByClaimId.get(claim.claim.claim_entity_id);
      if (topic) topics.add(topic);
    }
    return [...topics].sort((a, b) => a.localeCompare(b));
  }, [claims, topicByClaimId]);

  const visibleClaims = React.useMemo(
    () =>
      claims.filter(claim => {
        if (tab === 'debate-now' && opponentPositionOf(claim) === null) return false;
        if (topicFilter && topicByClaimId.get(claim.claim.claim_entity_id) !== topicFilter) return false;
        return true;
      }),
    [claims, opponentPositionOf, tab, topicFilter, topicByClaimId]
  );

  React.useEffect(() => {
    if (!session) return;
    if (session.status === 'converted' && session.converted_debate_id) {
      router.replace(`/space/${session.source_space_id}/debates/${session.converted_debate_id}`);
    } else if (session.status === 'ended' || session.status === 'expired') {
      router.replace(`/space/${session.source_space_id}/debates`);
    }
  }, [router, session]);

  const leave = () => {
    leaveSession.mutate(undefined, {
      onSuccess: ended => router.replace(`/space/${ended.source_space_id}/debates`),
    });
  };

  const pendingRequest = session?.status === 'request_pending' ? session.request : null;
  const incomingRequest = pendingRequest?.recipient_user_id === currentUserId ? pendingRequest : null;

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 py-8 sm:px-8">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h1 className="sr-only">Rematch {remoteName}</h1>
          <div className="flex min-w-0 items-center gap-5">
            <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
              All
            </TabButton>
            <TabButton active={tab === 'debate-now'} onClick={() => setTab('debate-now')}>
              <span>Debate now</span>
              <span
                className={cx(
                  'inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-metadataMedium tabular-nums',
                  tab === 'debate-now' ? 'bg-text text-white' : 'bg-grey-01 text-grey-04'
                )}
              >
                {opponentPositionCount}
              </span>
            </TabButton>
          </div>
          <button
            type="button"
            aria-label="Leave debate"
            title="Leave debate"
            onClick={leave}
            disabled={leaveSession.isPending}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-grey-02 text-grey-04 transition-colors hover:text-text disabled:opacity-50"
          >
            <LeaveIcon />
          </button>
        </header>

        <div className="mb-5">
          <TopicFilter value={topicFilter} topics={availableTopics} onChange={setTopicFilter} />
        </div>

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
          {visibleClaims.map(claim => (
            <RematchClaimCard
              key={claim.claim.claim_entity_id}
              claim={claim}
              topic={topicByClaimId.get(claim.claim.claim_entity_id) ?? null}
              session={session}
              currentUserId={currentUserId}
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
                  format_id: defaultDebateFormatId,
                })
              }
              busy={updatePosition.isPending || createRequest.isPending || session?.status === 'request_pending'}
            />
          ))}
        </div>

        {!savedClaimsQuery.isLoading && !publishedClaimsQuery.isLoading && visibleClaims.length === 0 && (
          <div className="rounded-lg border border-grey-02 bg-white p-6 text-center">
            <Text color="grey-04">
              {tab === 'debate-now'
                ? `${remoteName} hasn't picked a side yet. When they do, those claims show up here.`
                : topicFilter
                  ? 'No claims match this topic.'
                  : 'No other eligible claims are available yet.'}
            </Text>
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
  topic,
  session,
  currentUserId,
  onPositionChange,
  onRequest,
  busy,
}: {
  claim: DebateRematchClaim;
  topic: string | null;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  onPositionChange: (position: boolean) => void;
  onRequest: () => void;
  busy: boolean;
}) {
  const localPosition = claim.participants.find(position => position.user_id === currentUserId)?.position ?? null;
  const remotePosition = claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null;
  const opposing = localPosition !== null && remotePosition !== null && localPosition !== remotePosition;
  const request = session?.request;
  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

  return (
    <article className="rounded-lg border border-grey-02 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <Text as="div" variant="footnote" color="grey-04">
          {topic ?? (claim.shared_preference ? 'You both picked a side' : 'More claims')}
        </Text>
        {claim.recently_rejected && (
          <Text as="div" variant="footnote" color="grey-04">
            Recently rejected
          </Text>
        )}
      </div>
      <Text as="h2" variant="smallTitle" className="mt-3">
        {claim.claim.claim}
      </Text>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {[true, false].map(position => {
          const localOnPosition = localPosition === position;
          const holders = session
            ? claim.participants
                .filter(participant => participant.position === position)
                .map(participant => session.participants.find(sp => sp.user_id === participant.user_id))
                .filter((participant): participant is DebateRematchParticipant => Boolean(participant))
            : [];
          return (
            <button
              key={String(position)}
              type="button"
              aria-pressed={localOnPosition}
              onClick={() => onPositionChange(position)}
              disabled={busy || requesting}
              className="flex min-h-9 items-center justify-between gap-2 rounded-full bg-bg px-3 text-button text-text transition-colors hover:bg-grey-01 disabled:opacity-60 aria-pressed:bg-green"
            >
              <span>{position ? 'Yes' : 'No'}</span>
              {holders.length > 0 && <PositionAvatars participants={holders} />}
            </button>
          );
        })}
      </div>

      {(opposing || requesting) && (
        <button
          type="button"
          onClick={onRequest}
          disabled={!opposing || busy || requesting || claim.recently_rejected}
          className="mt-2 flex min-h-10 w-full items-center justify-center rounded-full bg-text px-4 text-button text-white transition-colors hover:bg-text/90 disabled:bg-grey-01 disabled:text-grey-04"
        >
          {requesting ? 'Requesting...' : 'Request debate'}
        </button>
      )}
    </article>
  );
}

function PositionAvatars({ participants }: { participants: DebateRematchParticipant[] }) {
  return (
    <span className="flex -space-x-1.5">
      {participants.map(participant => (
        <span
          key={participant.user_id}
          className="relative box-content block size-5 overflow-hidden rounded-full border-2 border-white"
        >
          <Avatar avatarUrl={participant.avatar_cid} value={participant.profile_space_id} size={20} />
        </span>
      ))}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex items-center gap-2 text-[1.4rem] leading-tight font-medium transition-colors',
        active ? 'text-text' : 'text-grey-03 hover:text-grey-04'
      )}
    >
      {children}
    </button>
  );
}

function TopicFilter({
  value,
  topics,
  onChange,
}: {
  value: string;
  topics: string[];
  onChange: (topic: string) => void;
}) {
  return (
    <div className="relative inline-flex">
      <select
        aria-label="Filter by topic"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="min-h-9 appearance-none rounded-full border border-grey-02 bg-white py-2 pr-9 pl-4 text-button text-text outline-hidden hover:border-grey-04 focus:border-text"
      >
        <option value="">Any topic</option>
        {topics.map(topic => (
          <option key={topic} value={topic}>
            {topic}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">
        <ChevronDownSmall color="grey-04" />
      </span>
    </div>
  );
}

function LeaveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 7V5a2 2 0 0 1 2-2h7v18h-7a2 2 0 0 1-2-2v-2" />
      <path d="M13 12H3" />
      <path d="M6 9l-3 3 3 3" />
    </svg>
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
