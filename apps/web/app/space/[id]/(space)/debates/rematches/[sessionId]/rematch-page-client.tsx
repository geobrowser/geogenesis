'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import {
  type DebateClaimPositionSummary,
  type DebateClaimSummary,
  type DebateRematchClaim,
  type DebateRematchParticipant,
  type DebateRematchSession,
  type MatchmakingReadiness,
  type MatchmakingTopic,
  getCurrentGeoChatUserId,
} from '~/core/debates/api';
import { DebateRequestDialog } from '~/core/debates/debate-request-dialog';
import { defaultDebateFormatId } from '~/core/debates/formats';
import {
  useAcceptDebateRematchRequest,
  useCreateDebateRematchRequest,
  useDebate,
  useDebateClaimsBySpaces,
  useDebateRematch,
  useDebateRematchClaims,
  useLeaveDebateRematch,
  useRejectDebateRematchRequest,
} from '~/core/debates/hooks';
import { SpaceTopicFilters } from '~/core/debates/matchmaking/claims-tab';
import { useClaimReadiness } from '~/core/debates/matchmaking/hooks';
import { HubCardList } from '~/core/debates/matchmaking/hub-motion';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { HubQueryState } from '~/core/debates/matchmaking/hub-states';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { uuidToHex } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';

import { Button } from '~/design-system/button';
import { getChecked } from '~/design-system/checkbox';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

const SEARCH_DEBOUNCE_MS = 250;

type PickerTab = 'opponent' | 'all';

/**
 * The tab is tight, so it uses the opponent's first name only: "Jenna Ruiz" -> "Jenna’s".
 * A name already ending in s takes the bare apostrophe: "Chris" -> "Chris’".
 */
function firstNamePossessive(name: string) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return firstName.endsWith('s') ? `${firstName}\u2019` : `${firstName}\u2019s`;
}

export function DebateRematchPageClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const currentUserId = getCurrentGeoChatUserId();
  const exitStartedRef = React.useRef(false);
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
  const createRequest = useCreateDebateRematchRequest(sessionId);
  const leaveSession = useLeaveDebateRematch(sessionId);
  const acceptRequest = useAcceptDebateRematchRequest();
  const rejectRequest = useRejectDebateRematchRequest();
  const session = sessionQuery.data ?? null;
  // A session opened from a profile challenge has no source debate, so nothing to exclude.
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
          response_kind: claimResponseKind(claim, claim.spaces[0]!),
          participants: (session?.participants ?? []).map(participant => ({
            user_id: participant.user_id,
            position: null,
            position_label: null,
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
  // label each card and drive the "Any topic" filter. A claim can carry several topics.
  const topicsByClaimId = React.useMemo(() => {
    const map = new Map<string, MatchmakingTopic[]>();
    for (const entity of publishedClaims) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    return map;
  }, [publishedClaims]);

  const [tab, setTab] = React.useState<PickerTab>('opponent');
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [topicId, setTopicId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const returnFromSession = React.useCallback(
    (endedSession: DebateRematchSession) => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;

      if (endedSession.source_debate_id === null) {
        if (window.history.length > 1) {
          router.back();
          return;
        }

        const opponentProfileSpaceId = endedSession.participants.find(
          participant => participant.user_id !== currentUserId
        )?.profile_space_id;
        router.replace(`/space/${opponentProfileSpaceId ?? endedSession.source_space_id}`);
        return;
      }

      router.replace(`/space/${endedSession.source_space_id}/debates`);
    },
    [currentUserId, router]
  );

  // The opponent tab shows claims they have already taken a side on; the badge counts them.
  const opponentPositionCount = React.useMemo(
    () => claims.filter(claim => opponentPositionOf(claim) !== null).length,
    [claims, opponentPositionOf]
  );

  const facetSpaceIds = React.useMemo(() => [...new Set(claims.map(claim => claim.claim.space_id))], [claims]);

  // The rematch claims response carries no readiness, so pull it from the per-space debate-claims
  // endpoint — one query per space the picker is showing — and key it by claim entity id.
  const claimIdsBySpace = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const claim of claims) {
      const existing = bySpace.get(claim.claim.space_id);
      if (existing) existing.push(claim.claim.claim_entity_id);
      else bySpace.set(claim.claim.space_id, [claim.claim.claim_entity_id]);
    }
    return bySpace;
  }, [claims]);
  const readinessByClaimId = useRematchClaimReadiness(claimIdsBySpace);

  const facetTopics = React.useMemo(() => {
    const seen = new Map<string, MatchmakingTopic>();
    for (const claim of claims) {
      for (const topic of topicsByClaimId.get(claim.claim.claim_entity_id) ?? []) {
        if (!seen.has(topic.id)) seen.set(topic.id, topic);
      }
    }
    return [...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [claims, topicsByClaimId]);

  // Everything narrows client-side: the rematch claim list is session-scoped (it already excludes
  // the source debate's claim and anything rejected), so there's no server query to push this into
  // the way the hub's Claims tab can.
  const visibleClaims = React.useMemo(
    () =>
      claims.filter(claim => {
        if (tab === 'opponent' && opponentPositionOf(claim) === null) return false;
        if (spaceId && claim.claim.space_id !== spaceId) return false;
        if (topicId && !(topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).some(t => t.id === topicId))
          return false;
        if (debouncedSearch && !claim.claim.claim.toLowerCase().includes(debouncedSearch)) return false;
        return true;
      }),
    [claims, debouncedSearch, opponentPositionOf, spaceId, tab, topicId, topicsByClaimId]
  );

  const hasFilters = Boolean(debouncedSearch || spaceId || topicId);

  React.useEffect(() => {
    if (!session) return;
    if (session.status === 'converted' && session.converted_debate_id) {
      router.replace(`/space/${session.source_space_id}/debates/${session.converted_debate_id}`);
    } else if (session.status === 'ended' || session.status === 'expired') {
      returnFromSession(session);
    }
  }, [returnFromSession, router, session]);

  const leave = () => {
    leaveSession.mutate(undefined, {
      onSuccess: returnFromSession,
    });
  };

  const pendingRequest = session?.status === 'request_pending' ? session.request : null;
  const incomingRequest = pendingRequest?.recipient_user_id === currentUserId ? pendingRequest : null;
  const incomingRequestParticipants =
    incomingRequest && session
      ? session.participants.map(participant => {
          const requester = participant.user_id === incomingRequest.requester_user_id;
          const position = requester ? incomingRequest.requester_position : incomingRequest.recipient_position;
          const positionLabel = requester
            ? incomingRequest.requester_position_label
            : incomingRequest.recipient_position_label;

          return {
            ...participant,
            position,
            position_label: positionLabel ?? responsePositionLabel(incomingRequest.response_kind ?? null, position),
          };
        })
      : [];

  return (
    <div className="fixed inset-0 z-[1000] overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 py-8 sm:px-8">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h1 className="sr-only">Rematch {remoteName}</h1>
          <div className="flex min-w-0 items-center gap-5">
            <TabButton active={tab === 'opponent'} onClick={() => setTab('opponent')}>
              <span className="truncate">{firstNamePossessive(remoteName)} positions</span>
              <span
                className={cx(
                  'inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-metadataMedium tabular-nums',
                  tab === 'opponent' ? 'bg-text text-white' : 'bg-grey-01 text-grey-04'
                )}
              >
                {opponentPositionCount}
              </span>
            </TabButton>
            <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
              All
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

        <div className="mb-3 flex flex-col gap-3">
          <SpaceTopicFilters
            spaceId={spaceId}
            onSpaceChange={setSpaceId}
            topicId={topicId}
            onTopicChange={setTopicId}
            facetSpaceIds={facetSpaceIds}
            facetTopics={facetTopics}
            className="justify-between"
          />
          <Input
            withSearchIcon
            value={search}
            onChange={event => setSearch(event.currentTarget.value)}
            placeholder="Search claims"
            aria-label="Search claims"
          />
        </div>

        {(createRequest.error instanceof Error || leaveSession.error instanceof Error) && (
          <Text color="red-01" className="mb-4">
            {createRequest.error instanceof Error
              ? createRequest.error.message
              : leaveSession.error instanceof Error
                ? leaveSession.error.message
                : null}
          </Text>
        )}
        {session?.request?.status === 'expired' && session.request.cancellation_reason && (
          <Text color="red-01" className="mb-4">
            {rematchCancellationMessage(session.request.cancellation_reason)}
          </Text>
        )}

        <HubQueryState
          isLoading={
            sessionQuery.isLoading ||
            savedClaimsQuery.isLoading ||
            publishedClaimsQuery.isLoading ||
            publishedClaimsLoading
          }
          error={sessionQuery.error ?? savedClaimsQuery.error ?? publishedClaimsQuery.error}
          isEmpty={visibleClaims.length === 0}
          emptyMessage={
            hasFilters
              ? 'No claims match these filters.'
              : tab === 'opponent'
                ? `${remoteName} hasn’t responded yet. When they do, those claims show up here.`
                : 'No other eligible claims are available yet.'
          }
          emptyAction={
            hasFilters
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    setSpaceId(null);
                    setTopicId(null);
                  },
                }
              : undefined
          }
        >
          <HubCardList>
            {visibleClaims.map(claim => (
              <RematchClaimCard
                key={claim.claim.claim_entity_id}
                claim={claim}
                session={session}
                currentUserId={currentUserId}
                readiness={readinessByClaimId.get(claim.claim.claim_entity_id) ?? null}
                onRequest={() =>
                  createRequest.mutate({
                    source_space_id: claim.claim.space_id,
                    claim_id: claim.claim.claim_entity_id,
                    format_id: defaultDebateFormatId,
                  })
                }
                busy={createRequest.isPending || session?.status === 'request_pending'}
              />
            ))}
          </HubCardList>
        </HubQueryState>

        {/* Outside the empty state on purpose: when a filter empties the list, fetching the next
            page is exactly the way out, so the control has to stay reachable. */}
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

      {incomingRequest && session && currentUserId && (
        <DebateRequestDialog
          claim={incomingRequest.claim.claim}
          participants={incomingRequestParticipants}
          currentUserId={currentUserId}
          formatId={incomingRequest.turn_format_id}
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

/** What the per-space debate-claims endpoint knows about a claim's readiness. */
type ClaimReadinessState = { viewer_debate_ready: boolean; readiness_disabled_reason: string | null };

/**
 * Readiness for every claim on screen, from the per-space debate-claims endpoint — the rematch
 * claims response doesn't carry it. One query per space, so the picker can render the hub's Debate
 * toggle against real state rather than drawing it permanently off.
 */
function useRematchClaimReadiness(claimIdsBySpace: Map<string, string[]>) {
  const spaceIds = React.useMemo(() => [...claimIdsBySpace.keys()].sort(), [claimIdsBySpace]);

  const results = useDebateClaimsBySpaces(
    React.useMemo(
      () => spaceIds.map(spaceId => ({ spaceId, claimIds: claimIdsBySpace.get(spaceId) ?? [] })),
      [claimIdsBySpace, spaceIds]
    )
  );

  return React.useMemo(() => {
    const byClaimId = new Map<string, ClaimReadinessState>();
    for (const claim of results) {
      byClaimId.set(claim.claim_entity_id, {
        viewer_debate_ready: claim.viewer_debate_ready,
        readiness_disabled_reason: claim.readiness_disabled_reason,
      });
    }
    return byClaimId;
  }, [results]);
}

/**
 * A rematch claim in the hub's card, so this picker and the debates side panel read as one
 * surface. The rematch API models positions per session participant, so the shared
 * `DebateClaimPositionSummary` shape is built here.
 */
function RematchClaimCard({
  claim,
  session,
  currentUserId,
  readiness: claimReadiness,
  onRequest,
  busy,
}: {
  claim: DebateRematchClaim;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  readiness: ClaimReadinessState | null;
  onRequest: () => void;
  busy: boolean;
}) {
  const serverLocalPosition = claim.participants.find(position => position.user_id === currentUserId)?.position ?? null;
  const remotePosition = claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null;

  // A claim whose stored kind didn't parse still has to render; 'stance' is the same fallback
  // `responsePositionLabel` applies, so the labels agree either way.
  const responseKind = claim.response_kind ?? 'stance';
  const target = {
    entityId: claim.claim.claim_entity_id,
    spaceId: claim.claim.space_id,
    responseKind,
  };

  // Read the client's own optimistic copy rather than waiting for geo-chat to catch up. Without
  // this the side you just picked stays unhighlighted, and "Request debate" only appears once the
  // rematch claims query refetches — seconds after the click.
  const { optimisticResponse } = useEntityResponse(target);
  const localPosition =
    optimisticResponse === undefined
      ? serverLocalPosition
      : optimisticResponse === null
        ? null
        : optimisticResponse === 'positive';

  const opposing = localPosition !== null && remotePosition !== null && localPosition !== remotePosition;
  const request = session?.request;
  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

  useAutoReadinessOptIn({
    claim: claim.claim,
    localPosition,
    alreadyReady: claimReadiness?.viewer_debate_ready ?? false,
  });

  const positions = React.useMemo(
    () => rematchPositionSummaries(claim, session, responseKind),
    [claim, responseKind, session]
  );
  const readiness: MatchmakingReadiness = {
    response_kind: responseKind,
    viewer_response:
      localPosition === null
        ? null
        : { position: localPosition, position_label: responsePositionLabel(responseKind, localPosition) },
    viewer_debate_ready: claimReadiness?.viewer_debate_ready ?? false,
    readiness_disabled_reason: claimReadiness?.readiness_disabled_reason ?? null,
  };

  return (
    <MatchmakingClaimCard
      claim={claim.claim}
      positions={positions}
      readiness={readiness}
      footer={
        opposing || requesting ? (
          <div className="mt-3">
            <HubPillButton
              onClick={onRequest}
              disabled={!opposing || busy || requesting || claim.recently_rejected}
              pending={requesting}
              pendingLabel="Requesting…"
              className="w-full"
            >
              Request debate
            </HubPillButton>
            {claim.recently_rejected ? (
              <Text as="p" variant="footnote" color="grey-04" className="mt-1">
                Recently rejected
              </Text>
            ) : null}
          </div>
        ) : null
      }
    />
  );
}

/**
 * Taking a side in this flow means you want to debate it, so standing ready is implied — the
 * viewer shouldn't have to flip the toggle as a second step. Only fires on a side picked while the
 * picker is open: opting in for positions that were already held would silently undo a deliberate
 * stand-down from elsewhere.
 */
function useAutoReadinessOptIn({
  claim,
  localPosition,
  alreadyReady,
}: {
  claim: DebateClaimSummary;
  localPosition: boolean | null;
  alreadyReady: boolean;
}) {
  const setReadiness = useClaimReadiness();
  const previousPosition = React.useRef<boolean | null>(localPosition);
  const optedInFor = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    const previous = previousPosition.current;
    previousPosition.current = localPosition;

    if (localPosition === null || previous === localPosition) return;
    if (alreadyReady || optedInFor.current === localPosition) return;

    optedInFor.current = localPosition;
    setReadiness.mutate({ spaceId: claim.space_id, claimId: claim.claim_entity_id, ready: true });
  }, [alreadyReady, claim.claim_entity_id, claim.space_id, localPosition, setReadiness]);
}

/** Both sides of a rematch claim in the shape the shared card renders avatars from. */
function rematchPositionSummaries(
  claim: DebateRematchClaim,
  session: DebateRematchSession | null,
  responseKind: 'stance' | 'veracity'
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const holders = claim.participants.filter(participant => participant.position === position);
    const participants = holders
      .map(holder => session?.participants.find(participant => participant.user_id === holder.user_id))
      .filter((participant): participant is DebateRematchParticipant => participant !== undefined);

    return {
      position,
      // Server labels win where a holder carries one, so an authoritative Verify/Dispute survives.
      position_label:
        holders.find(holder => holder.position_label)?.position_label ?? responsePositionLabel(responseKind, position),
      total_count: holders.length,
      // Only meaningful for the hub's "available now" counts; a rematch is already a fixed pair.
      available_now_count: 0,
      participants,
    };
  });
}

function claimResponseKind(
  entity: { values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }> },
  spaceId: string
): 'stance' | 'veracity' {
  const isFactual =
    getChecked(
      entity.values?.find(
        value =>
          value.isDeleted !== true &&
          uuidToHex(value.spaceId) === uuidToHex(spaceId) &&
          uuidToHex(value.property.id) === uuidToHex(CLAIM_IS_FACTUAL_PROPERTY_ID)
      )?.value
    ) === true;
  return isFactual ? 'veracity' : 'stance';
}

function rematchCancellationMessage(reason: string) {
  switch (reason) {
    case 'claim_response_withdrawn':
      return 'This request was cancelled because a participant withdrew their response.';
    case 'claim_response_kind_changed':
      return 'This request was cancelled because the claim’s response type changed.';
    case 'claim_response_position_changed':
    case 'claim_responses_not_opposed':
    case 'claim_response_changed_during_accept':
      return 'This request was cancelled because the responses no longer oppose each other.';
    default:
      return 'This debate request is no longer available.';
  }
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-selected={active}
      className={cx(
        'flex items-center gap-2 text-[1.4rem] leading-tight font-medium transition-colors',
        active ? 'text-text' : 'text-grey-03 hover:text-grey-04'
      )}
    >
      {children}
    </button>
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
