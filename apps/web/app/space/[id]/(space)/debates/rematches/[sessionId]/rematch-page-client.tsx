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
  useDebateRematchClaimsForIds,
  useLeaveDebateRematch,
  useRejectDebateRematchRequest,
} from '~/core/debates/hooks';
import { SpaceTopicFilters } from '~/core/debates/matchmaking/claims-tab';
import { useClaimReadiness } from '~/core/debates/matchmaking/hooks';
import { HubCardList } from '~/core/debates/matchmaking/hub-motion';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { HubQueryState } from '~/core/debates/matchmaking/hub-states';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { useRecommendedClaimSections } from '~/core/debates/recommended-claims';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useEntityResponse } from '~/core/hooks/use-entity-vote';
import { uuidToHex } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { useQueryEntities } from '~/core/sync/use-store';

import { Button } from '~/design-system/button';
import { getChecked } from '~/design-system/checkbox';
import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Text } from '~/design-system/text';

const SEARCH_DEBOUNCE_MS = 250;

type PickerTab = 'recommended' | 'opponent' | 'all';

/**
 * The tab is narrow, so it carries the opponent's first name only: "Jenna Ruiz" -> "Jenna’s".
 * A name already ending in s takes the bare apostrophe: "Chris" -> "Chris’".
 */
function firstNamePossessive(name: string) {
  const firstName = name.trim().split(/\s+/)[0] || name;
  return firstName.endsWith('s') ? `${firstName}’` : `${firstName}’s`;
}

export function DebateRematchPageClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const currentUserId = getCurrentGeoChatUserId();
  const exitStartedRef = React.useRef(false);
  const sessionQuery = useDebateRematch(sessionId);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const [publishedClaimsCursor, setPublishedClaimsCursor] = React.useState<string | undefined>();

  // A new term is a new corpus, so paging starts over.
  React.useEffect(() => {
    setPublishedClaimsCursor(undefined);
  }, [debouncedSearch]);

  const {
    entities: publishedClaimsPage,
    isLoading: publishedClaimsLoading,
    isPlaceholderData: publishedClaimsPlaceholder,
    endCursor: publishedClaimsEndCursor,
    hasNextPage: publishedClaimsHasNextPage,
  } = useQueryEntities({
    // Search runs in the query rather than over the loaded pages. The All tab browses every
    // published claim 50 at a time, so filtering locally only ever searched what had been paged
    // in — the hub's Claims tab searches server-side, and this now matches it. `contains` maps to
    // the same case-insensitive substring its `?search=` does.
    where: {
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
      ...(debouncedSearch ? { name: { contains: debouncedSearch } } : {}),
    },
    first: 50,
    after: publishedClaimsCursor,
    placeholderData: keepPreviousData,
  });

  // Pages accumulate as the viewer loads more, but a change of term replaces them rather than
  // piling the new matches on top of the previous corpus.
  const [publishedClaims, setPublishedClaims] = React.useState<{
    search: string;
    entities: typeof publishedClaimsPage;
  }>({ search: '', entities: [] });
  React.useEffect(() => {
    // `keepPreviousData` keeps the old term's page on screen while the new one fetches. Recording
    // that under the new term would file the previous search's claims as matches for this one, and
    // the real page would then merge on top of them rather than replace them.
    if (publishedClaimsPlaceholder) return;

    setPublishedClaims(current => {
      const sameSearch = current.search === debouncedSearch;
      const base = sameSearch ? current.entities : [];
      const next = new Map(base.map(claim => [claim.id, claim]));
      for (const claim of publishedClaimsPage) {
        if (!next.has(claim.id)) next.set(claim.id, claim);
      }
      if (sameSearch && next.size === base.length) return current;
      return { search: debouncedSearch, entities: [...next.values()] };
    });
  }, [debouncedSearch, publishedClaimsPage, publishedClaimsPlaceholder]);
  const savedClaimsQuery = useDebateRematchClaims(sessionId);
  const createRequest = useCreateDebateRematchRequest(sessionId);
  const leaveSession = useLeaveDebateRematch(sessionId);
  const acceptRequest = useAcceptDebateRematchRequest();
  const rejectRequest = useRejectDebateRematchRequest();
  const session = sessionQuery.data ?? null;
  // A session opened from a profile challenge has no source debate, so nothing to exclude.
  const sourceDebateQuery = useDebate(session?.source_debate_id ?? '', Boolean(session?.source_debate_id));

  // The opponent is whichever participant isn't the local user; both drive the curated lookup.
  const participantSpaceIds = React.useMemo(
    () => (session?.participants ?? []).map(participant => participant.profile_space_id),
    [session?.participants]
  );
  // Curated claims are picked by hand, so they can be ones the browsed pages haven't reached. The
  // hook hands back their entities along with the sections, and they join the same pool the browsed
  // claims feed — so the session lookup, response kinds and the cards treat them like any other
  // published claim.
  const { sections: recommendedSections, claimEntities: recommendedEntities } =
    useRecommendedClaimSections(participantSpaceIds);

  const claimEntities = React.useMemo(() => {
    const byId = new Map(publishedClaims.entities.map(claim => [claim.id, claim]));
    for (const claim of recommendedEntities) if (!byId.has(claim.id)) byId.set(claim.id, claim);
    return [...byId.values()];
  }, [publishedClaims.entities, recommendedEntities]);

  const publishedClaimIds = React.useMemo(() => claimEntities.map(claim => claim.id), [claimEntities]);
  // Batched: geo-chat caps the ids per request, and the browsed list plus the curated claims runs
  // past that cap after a page or two of Load more.
  const publishedClaimsQuery = useDebateRematchClaimsForIds(sessionId, publishedClaimIds);

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
    for (const claim of claimEntities) {
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
  }, [claimEntities, publishedClaimsQuery.data, savedClaimsQuery.data, session?.participants, sourceDebateQuery.data]);
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
    for (const entity of claimEntities) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    return map;
  }, [claimEntities]);

  // Left unset until the viewer picks one: Recommended is the best landing tab when a curator has
  // put something together for this pairing, and it doesn't exist otherwise. Deciding in state
  // would fix the default before that lookup settles.
  const [chosenTab, setChosenTab] = React.useState<PickerTab | null>(null);
  const [spaceId, setSpaceId] = React.useState<string | null>(null);
  const [topicId, setTopicId] = React.useState<string | null>(null);

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

  // "Debate now" = claims the opponent has responded to; the tab badge counts them.
  const opponentPositionCount = React.useMemo(
    () => claims.filter(claim => opponentPositionOf(claim) !== null).length,
    [claims, opponentPositionOf]
  );

  const hasRecommended = recommendedSections.length > 0;
  const tab: PickerTab = chosenTab ?? (hasRecommended ? 'recommended' : 'opponent');
  const setTab = setChosenTab;

  const facetSpaceIds = React.useMemo(() => [...new Set(claims.map(claim => claim.claim.space_id))], [claims]);

  const facetTopics = React.useMemo(() => {
    const seen = new Map<string, MatchmakingTopic>();
    for (const claim of claims) {
      for (const topic of topicsByClaimId.get(claim.claim.claim_entity_id) ?? []) {
        if (!seen.has(topic.id)) seen.set(topic.id, topic);
      }
    }
    return [...seen.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [claims, topicsByClaimId]);

  // The rematch claim list is session-scoped — it already drops the source debate's claim and
  // anything recently rejected — so there's no server query to push these into, the way the hub's
  // Claims tab can.
  const visibleClaims = React.useMemo(
    () =>
      claims.filter(claim => {
        if (tab === 'opponent' && opponentPositionOf(claim) === null) return false;
        if (spaceId && claim.claim.space_id !== spaceId) return false;
        if (topicId && !(topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).some(t => t.id === topicId))
          return false;
        // Still applied locally: the session's own claims come from geo-chat, not the query above,
        // so they'd otherwise ignore the term. Case-insensitive substring, matching what the
        // query does to the published half.
        if (debouncedSearch && !claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
        return true;
      }),
    [claims, debouncedSearch, opponentPositionOf, spaceId, tab, topicId, topicsByClaimId]
  );

  const hasFilters = Boolean(debouncedSearch || spaceId || topicId);

  // The curated tab groups by block rather than listing flat, but narrows on the same filters.
  const visibleSections = React.useMemo(() => {
    if (tab !== 'recommended') return [];
    const visibleById = new Map(visibleClaims.map(claim => [claim.claim.claim_entity_id, claim]));

    return recommendedSections
      .map(section => ({
        ...section,
        claims: section.claimIds
          .map(claimId => visibleById.get(claimId))
          .filter((claim): claim is DebateRematchClaim => claim !== undefined),
      }))
      .filter(section => section.claims.length > 0);
  }, [recommendedSections, tab, visibleClaims]);

  // Readiness drives the card's Debate toggle and the rematch claims response doesn't carry it, so
  // read it from the per-space debate-claims endpoint instead — one query per space on screen.
  const claimIdsBySpace = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const claim of claims) {
      const existing = bySpace.get(claim.claim.space_id);
      if (existing) existing.push(claim.claim.claim_entity_id);
      else bySpace.set(claim.claim.space_id, [claim.claim.claim_entity_id]);
    }
    return bySpace;
  }, [claims]);
  const { byClaimId: readinessByClaimId, unresolved: readinessUnresolved } =
    useClaimReadinessByClaimId(claimIdsBySpace);

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

  const renderClaimCard = (claim: DebateRematchClaim) => (
    <RematchClaimCard
      key={claim.claim.claim_entity_id}
      claim={claim}
      session={session}
      currentUserId={currentUserId}
      readiness={readinessByClaimId.get(claim.claim.claim_entity_id) ?? null}
      readinessUnresolved={readinessUnresolved}
      onRequest={() =>
        createRequest.mutate({
          source_space_id: claim.claim.space_id,
          claim_id: claim.claim.claim_entity_id,
          format_id: defaultDebateFormatId,
        })
      }
      busy={createRequest.isPending || session?.status === 'request_pending'}
    />
  );

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
    // Below the entity side panel (z-200) on purpose: a claim opens there rather than navigating,
    // and the panel has to land on top. Still above the navbar (z-60) and the app's z-100 band, so
    // the session keeps the screen to itself.
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 py-8 sm:px-8">
        <header className="mb-4 flex items-center justify-between gap-4">
          <h1 className="sr-only">Rematch {remoteName}</h1>
          <div className="flex min-w-0 items-center gap-5">
            {hasRecommended ? (
              <TabButton active={tab === 'recommended'} onClick={() => setTab('recommended')}>
                Recommended
              </TabButton>
            ) : null}
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
          isEmpty={tab === 'recommended' ? visibleSections.length === 0 : visibleClaims.length === 0}
          emptyMessage={
            hasFilters
              ? 'No claims match these filters.'
              : tab === 'recommended'
                ? `Nothing recommended for you and ${remoteName} yet.`
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
          {tab === 'recommended' ? (
            // Each data block on the curator's page is its own section, in page order.
            <div className="flex flex-col gap-4">
              {visibleSections.map(section => (
                <RecommendedSection key={section.id} name={section.name} count={section.claims.length}>
                  <HubCardList>{section.claims.map(renderClaimCard)}</HubCardList>
                </RecommendedSection>
              ))}
            </div>
          ) : (
            <HubCardList>{visibleClaims.map(renderClaimCard)}</HubCardList>
          )}
        </HubQueryState>

        {/* Outside the empty state deliberately: when a filter empties the list, fetching another
            page is the way out, so the control has to stay reachable. Not on the curated tab
            though — its sections come from the page whole, so there is no next page to fetch. */}
        {tab !== 'recommended' && publishedClaimsHasNextPage && (
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
 * Readiness for every claim on screen, keyed by claim entity id. The rematch claims response
 * doesn't carry it, so this reads the per-space debate-claims endpoint — one query per space —
 * letting the shared card render its Debate toggle against real state.
 */
function useClaimReadinessByClaimId(claimIdsBySpace: Map<string, string[]>) {
  const groups = React.useMemo(
    () =>
      [...claimIdsBySpace.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([spaceId, claimIds]) => ({ spaceId, claimIds })),
    [claimIdsBySpace]
  );
  const { claims, isLoading, isError } = useDebateClaimsBySpaces(groups);

  const byClaimId = React.useMemo(() => {
    const map = new Map<string, ClaimReadinessState>();
    for (const claim of claims) {
      map.set(claim.claim_entity_id, {
        viewer_debate_ready: claim.viewer_debate_ready,
        readiness_disabled_reason: claim.readiness_disabled_reason,
      });
    }
    return map;
  }, [claims]);

  // A claim missing from a settled lookup genuinely has no readiness row, so `false` is the truth.
  // Missing while a lookup is still running or has failed means we don't know, and a switch drawn
  // from a guess is worse than one that waits.
  return { byClaimId, unresolved: isLoading || isError };
}

/**
 * A rematch claim in the hub's card, so the picker and the debates side panel read as one surface.
 * The rematch API models sides per session participant, so the shared `DebateClaimPositionSummary`
 * shape is assembled here.
 */
function RematchClaimCard({
  claim,
  session,
  currentUserId,
  readiness: claimReadiness,
  readinessUnresolved,
  onRequest,
  busy,
}: {
  claim: DebateRematchClaim;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  readiness: ClaimReadinessState | null;
  /** True while any readiness lookup is still running or has failed. */
  readinessUnresolved: boolean;
  onRequest: () => void;
  busy: boolean;
}) {
  const serverLocalPosition = claim.participants.find(side => side.user_id === currentUserId)?.position ?? null;
  const remotePosition = claim.participants.find(side => side.user_id !== currentUserId)?.position ?? null;

  // A claim whose stored kind didn't parse still has to render; 'stance' is the fallback
  // `responsePositionLabel` already applies, so the labels agree either way.
  const responseKind = claim.response_kind ?? 'stance';

  // The client knows its own answer long before geo-chat echoes it back. Reading the optimistic
  // copy is what keeps the side you just picked highlighted, and Request debate appearing with it,
  // instead of both waiting on a refetch.
  const { optimisticResponse } = useEntityResponse({
    entityId: claim.claim.claim_entity_id,
    spaceId: claim.claim.space_id,
    responseKind,
  });
  const localPosition =
    optimisticResponse === undefined
      ? serverLocalPosition
      : optimisticResponse === null
        ? null
        : optimisticResponse === 'positive';

  const opposing = localPosition !== null && remotePosition !== null && localPosition !== remotePosition;
  const { openSidePanel } = useEntitySidePanel();
  const request = session?.request;

  useReadinessOnFirstPosition({
    claim: claim.claim,
    localPosition,
    alreadyReady: claimReadiness?.viewer_debate_ready ?? false,
  });
  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

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
      // Reading a claim shouldn't cost the session: navigating to its entity page would leave the
      // rematch behind, so open it beside the picker instead.
      onOpenClaim={() => openSidePanel(claim.claim.claim_entity_id, claim.claim.space_id, false)}
      // Rather than draw the switch off on a guess. Only while this claim's readiness is genuinely
      // unknown — a settled lookup that simply has no row for it really does mean "not ready".
      hideReadinessToggle={claimReadiness === null && readinessUnresolved}
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
 * Taking a side here means you want to debate this claim, so readiness follows rather than being a
 * second step the viewer has to find. Deliberately local to the picker: the hub's Claims tab keeps
 * the two separate, where browsing and standing ready really are different intents.
 *
 * Only a side picked while the picker is open counts. Opting in for positions already held on
 * arrival would fire a write per claim on load, and would silently undo a stand-down the viewer
 * made somewhere else. Switching sides doesn't re-fire either, for the same reason.
 */
function useReadinessOnFirstPosition({
  claim,
  localPosition,
  alreadyReady,
}: {
  claim: DebateClaimSummary;
  localPosition: boolean | null;
  alreadyReady: boolean;
}) {
  const setReadiness = useClaimReadiness();
  // Seeded with the position held on mount, so arriving with one is not a transition.
  const previousPosition = React.useRef(localPosition);
  const optedIn = React.useRef(false);

  React.useEffect(() => {
    const previous = previousPosition.current;
    previousPosition.current = localPosition;

    const justEstablished = previous === null && localPosition !== null;
    if (!justEstablished || alreadyReady || optedIn.current) return;

    optedIn.current = true;
    setReadiness.mutate({ spaceId: claim.space_id, claimId: claim.claim_entity_id, ready: true });
  }, [alreadyReady, claim.claim_entity_id, claim.space_id, localPosition, setReadiness]);
}

/** One curated block, collapsible so a long page of recommendations stays scannable. */
function RecommendedSection({ name, count, children }: { name: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  const contentId = React.useId();

  return (
    <section>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(current => !current)}
        className="mb-2 flex w-full items-center gap-2 text-left"
      >
        <Text as="h2" variant="smallTitle" color="text">
          {name}
        </Text>
        <span className={cx('text-grey-04 transition-transform', open ? 'rotate-180' : undefined)}>
          <ChevronDownSmall />
        </span>
        <span className="sr-only">{`${count} ${count === 1 ? 'claim' : 'claims'}`}</span>
      </button>
      {open ? <div id={contentId}>{children}</div> : null}
    </section>
  );
}

/** Both sides of a rematch claim, in the shape the shared card draws avatars from. */
function rematchPositionSummaries(
  claim: DebateRematchClaim,
  session: DebateRematchSession | null,
  responseKind: 'stance' | 'veracity'
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const holders = claim.participants.filter(side => side.position === position);
    const participants = holders
      .map(holder => session?.participants.find(participant => participant.user_id === holder.user_id))
      .filter((participant): participant is DebateRematchParticipant => participant !== undefined);

    return {
      position,
      // A server-supplied label wins, so an authoritative Verify/Dispute survives.
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
