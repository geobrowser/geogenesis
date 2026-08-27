'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import {
  type DebateClaimPositionSummary,
  type DebateClaimSummary,
  type DebateRematchClaim,
  type DebateRematchClaimPosition,
  type DebateRematchParticipant,
  type DebateRematchSession,
  type DebateResponseKind,
  type MatchmakingClaimsQuery,
  type MatchmakingReadiness,
  type MatchmakingTopic,
} from '~/core/debates/api';
import { type ClaimPickerEntity, useClaimEntitiesByIds } from '~/core/debates/claim-picker-page';
import { eligibleClaimSpaceIds, isClaimSpaceAllowed } from '~/core/debates/claim-space-allowlist';
import { markEnteringDebate } from '~/core/debates/debate-entry-intent';
import { useDebateGatewaySpaceScopes } from '~/core/debates/debate-gateway';
import { debatePublishableSpacePredicate } from '~/core/debates/debate-publish-target';
import { DebateRequestDialog } from '~/core/debates/debate-request-dialog';
import { consumeDebateReturnDestination } from '~/core/debates/debate-return-navigation';
import { type FeaturedClaim, dedupeFeaturedClaims, useFeaturedClaims } from '~/core/debates/featured-claims';
import { defaultDebateFormatId } from '~/core/debates/formats';
import {
  useAcceptDebateRematchRequest,
  useCreateDebateRematchRequest,
  useDebate,
  useDebateClaimsBySpaces,
  useDebateRematch,
  useDebateRematchClaims,
  useDebateRematchClaimsForIds,
  useGeoChatAuth,
  useLeaveDebateRematch,
  useRejectDebateRematchRequest,
} from '~/core/debates/hooks';
import { SpaceTopicFilters } from '~/core/debates/matchmaking/claims-tab';
import { HubFilterMenu, type HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { HubCardList } from '~/core/debates/matchmaking/hub-motion';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { HubQueryState, HubSkeleton } from '~/core/debates/matchmaking/hub-states';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import {
  countBy,
  keepSelectableTopics,
  keepSelectedVisible,
  mergeFacetCounts,
  orderFacetOptions,
  toggleId,
} from '~/core/debates/matchmaking/topic-facets';
import { useScopedMatchmakingClaims } from '~/core/debates/matchmaking/use-scoped-claims';
import { useStableListOrder } from '~/core/debates/matchmaking/use-stable-list-order';
import { participantSidesOn, useParticipantPositions } from '~/core/debates/participant-positions';
import { useRecommendedClaimSections } from '~/core/debates/recommended-claims';
import { useClaimDebateReadiness } from '~/core/debates/use-claim-debate-readiness';
import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';

import { RematchVoicePill } from './rematch-voice';
import { useEntityResponse, useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { uuidToHex } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

const SEARCH_DEBOUNCE_MS = 250;

const NO_PARTICIPANTS: DebateRematchParticipant[] = [];

function sameId(left: string, right: string) {
  return uuidToHex(left) === uuidToHex(right);
}

/**
 * `value` once it has settled, and the last settled value while it is settling again. Before the
 * first settle there is nothing to hold, and the (empty) unsettled value comes through — which is
 * what lets the first load show a loading state instead of an empty list.
 */
function useLastSettled<T>(value: T, settling: boolean, resetKey: string): T {
  const lastSettledRef = React.useRef<{ value: T } | null>(null);
  const resetRef = React.useRef(resetKey);

  // Holding across a change of key would be holding the wrong thing. The page keeps its instance
  // when the route moves from one rematch to another — nothing keys it on the session — so without
  // this the previous session's claims stay on screen while the new one loads, and the order they
  // were in seeds the new session's.
  if (resetRef.current !== resetKey) {
    resetRef.current = resetKey;
    lastSettledRef.current = null;
  }

  if (!settling) lastSettledRef.current = { value };
  return settling && lastSettledRef.current ? lastSettledRef.current.value : value;
}

type PickerTab = 'claims' | 'opponent';

/**
 * GEO-2683. Where the Claims tab draws its list from. Recommended, Featured and the whole corpus
 * are three answers to one question — "which claims?" — so they belong in a menu rather than in
 * three tabs the viewer has to notice appearing and disappearing.
 */
type ClaimsSource = 'recommended' | 'featured' | 'all';

const CLAIMS_SOURCE_LABELS: Record<ClaimsSource, string> = {
  recommended: 'Recommended',
  featured: 'Featured',
  all: 'All claims',
};

/** Stable identity so the hydration below doesn't restart whenever Featured isn't the source. */
const NO_FEATURED_CLAIMS: FeaturedClaim[] = [];

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
  const currentUserId = useCurrentGeoChatUserId();
  const exitStartedRef = React.useRef(false);
  const sessionQuery = useDebateRematch(sessionId);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  // Left unset until the viewer picks one: Recommended is the best landing tab when a curator has
  // put something together for this pairing, and it doesn't exist otherwise. Deciding in state
  // would fix the default before that lookup settles.
  const [chosenTab, setChosenTab] = React.useState<PickerTab | null>(null);
  // Left unset until the viewer picks one: Recommended is the best default when a curator has put
  // something together for this pairing, and it doesn't exist otherwise. Deciding in state would
  // fix the default before that lookup settles.
  const [chosenSource, setChosenSource] = React.useState<ClaimsSource | null>(null);

  // Claims is where the picker opens, whatever its source turns out to be. The strip no longer
  // shifts under the viewer as lookups land: which claims Claims shows is the menu's business now,
  // and the menu says so in words rather than by growing a tab.
  const tab: PickerTab = chosenTab ?? 'claims';
  const setTab = setChosenTab;

  const savedClaimsQuery = useDebateRematchClaims(sessionId);
  const createRequest = useCreateDebateRematchRequest(sessionId);
  const leaveSession = useLeaveDebateRematch(sessionId);
  const acceptRequest = useAcceptDebateRematchRequest();
  const rejectRequest = useRejectDebateRematchRequest();
  const session = sessionQuery.data ?? null;
  const participants = React.useMemo(() => session?.participants ?? NO_PARTICIPANTS, [session?.participants]);
  // A session opened from a profile challenge has no source debate, so nothing to exclude.
  const sourceDebateQuery = useDebate(session?.source_debate_id ?? '', Boolean(session?.source_debate_id));

  // Both participants' sides on every claim, straight from the knowledge graph. A position is an
  // on-chain claim response; geo-chat only mirrors them, a hundred claim ids per request. This is
  // one query for both people, and it is what the opponent's tab is a list of.
  const positions = useParticipantPositions(participants);

  const remoteParticipant =
    currentUserId === null ? null : (participants.find(participant => participant.user_id !== currentUserId) ?? null);
  const remoteName = remoteParticipant?.display_name || remoteParticipant?.profile_space_id || 'debater';

  // The claims the opponent has taken a side on, newest response first — the graph returns them in
  // that order, and the grouping keeps it.
  const opponentClaimIds = React.useMemo(() => {
    if (!remoteParticipant) return [];
    const ids: string[] = [];
    for (const [claimId, rows] of positions.byClaim) {
      if (rows.some(row => sameId(row.profileSpaceId, remoteParticipant.profile_space_id))) ids.push(claimId);
    }
    return ids;
  }, [positions.byClaim, remoteParticipant]);

  // Those ids are all the graph hands back; the claim itself — name, description, home space,
  // whether it is factual, topics — is a second, narrow lookup.
  const opponentEntitiesQuery = useClaimEntitiesByIds(opponentClaimIds);

  // The opponent is whichever participant isn't the local user; both drive the curated lookup.
  const participantSpaceIds = React.useMemo(
    () => participants.map(participant => participant.profile_space_id),
    [participants]
  );
  // Curated claims are picked by hand, so they can be ones the opponent has never answered. The
  // hook hands back their entities along with the sections, and they join the same pool — so the
  // session lookup, response kinds and the cards treat them like any other claim.
  const {
    sections: recommendedSections,
    claimEntities: recommendedEntities,
    isLoading: recommendedLoading,
  } = useRecommendedClaimSections(participantSpaceIds);

  const recommendedClaimIds = React.useMemo(
    () => [...new Set(recommendedSections.flatMap(section => section.claimIds))],
    [recommendedSections]
  );

  // Featured spaces plus the ones the viewer belongs to. It narrows the All tab, which browses the
  // whole published corpus and would otherwise offer claims from spaces the viewer has nothing to do
  // with.
  //
  // The other two tabs are deliberately outside it. Each is bounded by an explicit source — one
  // person's own responses, or one page from a curator space this build trusts by id — so neither
  // can fan out the way browsing can, and the viewer's *own* space membership says nothing about
  // whether the source is worth showing. Applying it there emptied both tabs in the ordinary case:
  // a debater's claims live in their personal space, which nobody else is a member of, so the
  // opponent's positions and a curator's page were dropped wholesale on the other side.
  const { allowlist: spaceAllowlist, isLoading: allowlistLoading } = useClaimSpaceAllowlist();

  // While it is still resolving there is no telling an allowed space from one the viewer has
  // nothing to do with. Every list waits for it rather than showing the unfiltered set and
  // trimming it under the viewer — a lookup that settled without an answer leaves this false and
  // falls through to the unfiltered list, since too wide beats never filling. The wait is the
  // allowlist alone: the lists' own lookups run alongside it, so they are ready when it lands.
  const allowlistPending = spaceAllowlist === null && allowlistLoading;

  // The acceptor's editor spaces are the authoritative answer, and the same set the publish sweep
  // works from. The space-type test is kept alongside rather than replaced by it: the two fail
  // differently, and when this list is unknown — no acceptor configured, a failed lookup — the
  // type test still rules out the case that actually bit us, claims living in a personal space.
  //
  // Read here rather than beside `canPublishDebateIn` below, because the scope built underneath
  // it has to reach the query, which runs before either.
  const { publishableSpaceIds, isLoading: publishablePending } = useDebatePublishableSpaces();

  // Same scoping as the hub's Claims tab: the facets have to describe the spaces this pairing can
  // actually be shown claims from, or the topic menu offers topics from spaces `browsedRows`
  // removes.
  //
  // It has to apply all three gates `canPublishDebateIn` does, including the space-type one that
  // rules out personal spaces — the allowlist holds the viewer's own — or a personal space slips
  // into the scope whenever the editor-space lookup is unresolved, since that gate passes
  // everything until it lands.
  //
  // Typed off its own lookup rather than through `canPublishDebateIn`, which reads `candidateSpaces`
  // — built from the claims this very query returns. Going through it would make the query depend
  // on its own result. The allowlist depends on nothing here, so asking for those types directly
  // breaks the loop.
  // Same fallback as the Claims tab: an allowlist that settled without an answer stops narrowing
  // by *it*, not by everything. The publishable set answers a different question and still bounds
  // which spaces can be shown, so the scope — and the type lookup that trims it further — run over
  // whichever of the two is known.
  const candidateScopeIds = spaceAllowlist ?? publishableSpaceIds;
  const allowlistSpaceIds = React.useMemo(() => (candidateScopeIds ? [...candidateScopeIds] : []), [candidateScopeIds]);
  const {
    spacesById: allowlistSpaces,
    isLoading: allowlistSpacesPending,
    isPlaceholderData: allowlistSpacesHeldOver,
  } = useSpacesByIds(allowlistSpaceIds);
  const allowlistTypePublishable = React.useMemo(
    () => debatePublishableSpacePredicate(allowlistSpaces),
    [allowlistSpaces]
  );
  const eligibleSpaceIds = React.useMemo(
    () =>
      eligibleClaimSpaceIds(
        candidateScopeIds,
        id =>
          isClaimSpaceAllowed(id, spaceAllowlist) &&
          isSpaceDebatePublishable(id, publishableSpaceIds) &&
          allowlistTypePublishable(id)
      ),
    [allowlistTypePublishable, candidateScopeIds, publishableSpaceIds, spaceAllowlist]
  );

  // The empty-scope case belongs to the shared hook below. This is the same problem reached the
  // other way: a space can be in the menu without being in the allowlist — the graph-backed tabs
  // aren't narrowed by it, so their rows put their spaces there — but `browsedRows` still drops
  // every *browsed* row from a disallowed space. Selecting one leaves the server answering with
  // rows that cannot be shown, and a facet describing them, while only the pinned rows survive.
  // Every picked space, not any: with one allowed space picked alongside a disallowed one, the
  // browsed corpus still has rows to give.
  // The graph-backed sources deliberately offer spaces outside the viewer's allowlist, so a
  // selection can hold both kinds at once. Only the allowed ones may reach geo-chat: `browsedRows`
  // drops the rest anyway, but the facets riding with them would still name their topics and count
  // their claims. The full selection stays in `spaceIds` for the pinned rows, which come from the
  // graph and are not narrowed by the allowlist.
  const browsableSpaceIds = React.useMemo(
    () => spaceIds.filter(id => isClaimSpaceAllowed(id, spaceAllowlist)),
    [spaceAllowlist, spaceIds]
  );

  // Nothing left to ask about once every pick is one geo-chat cannot answer for.
  const selectedSpaceShowsNothing = spaceIds.length > 0 && browsableSpaceIds.length === 0;

  // Every lookup the scope is built from. Until they have all landed the scope is `null`, which
  // geo-chat reads as "no filter" — so asking now buys an answer about the whole corpus, whose
  // rows are dropped below and whose topic facet is not. See the Claims tab, same shape.
  //
  // The held-over map counts as pending. `useSpacesByIds` keeps the previous id set's answers
  // rather than blanking every space image on screen, and says in its own contract that a caller
  // asking about a *missing* id has to check for it. This is such a caller: an id added to the
  // allowlist is absent from the held map, and an absent type reads as publishable — so the space
  // this gate exists to keep out is exactly the one that slips through the window.
  const scope = React.useMemo(
    () => ({
      spaceIds: eligibleSpaceIds,
      pending: allowlistPending || publishablePending || allowlistSpacesPending || allowlistSpacesHeldOver,
    }),
    [allowlistPending, allowlistSpacesHeldOver, allowlistSpacesPending, eligibleSpaceIds, publishablePending]
  );

  // GEO-2683. Fetched only when Featured is the source on screen — it is one option in a menu, and
  // the other two answer for themselves.
  //
  // Narrowed by the viewer's allowlist, unlike Recommended. Recommended is one page from a space
  // this build trusts by id; Featured is a tag anyone's space can carry, so it fans out across the
  // corpus the way All claims does and is bounded the same way.
  const hasRecommended = recommendedSections.length > 0;
  // Until the curated lookup settles there is no telling "no curator page" from "not yet", and the
  // default turns on exactly that. The list waits rather than showing Featured and swapping it for
  // Recommended a moment later.
  const sourceUndecided = chosenSource === null && recommendedLoading;
  const source: ClaimsSource = chosenSource ?? (hasRecommended ? 'recommended' : 'featured');
  // Gated on the tab too: a remembered Featured source shouldn't keep a graph query alive behind the
  // opponent's positions, which draw from somewhere else entirely.
  const featuredEnabled = tab === 'claims' && source === 'featured' && !sourceUndecided;
  const {
    claims: featuredCatalog,
    isLoading: featuredCatalogLoading,
    error: featuredCatalogError,
  } = useFeaturedClaims(featuredEnabled);

  // Collapsed to one row per claim *after* the allowlist, not before. A claim can be tagged in
  // several spaces, and deduplicating first would let a space outside the allowlist stand for a
  // claim featured in one inside it — dropping it from the list entirely.
  //
  // The tag survives rather than just its id. Its space is the space the claim is featured in, and
  // the only one here known to have passed the allowlist — the rows below are built against it.
  //
  // Gated on `featuredEnabled` too, not only on the fetch: `enabled: false` leaves react-query's
  // cached rows in place, and the hub shares this key, so a catalog fetched there would otherwise
  // keep the hydration below mounted and refetching behind Recommended or the opponent's tab.
  const featuredSelection = React.useMemo(
    () =>
      !featuredEnabled || allowlistPending
        ? NO_FEATURED_CLAIMS
        : dedupeFeaturedClaims(featuredCatalog.filter(claim => isClaimSpaceAllowed(claim.spaceId, spaceAllowlist))),
    [allowlistPending, featuredCatalog, featuredEnabled, spaceAllowlist]
  );

  const featuredClaimIds = React.useMemo(
    () => featuredSelection.map(claim => claim.claimEntityId),
    [featuredSelection]
  );

  // The same two lookups the curated source makes: the claim entities the picker's rows are built
  // from, and geo-chat's session rows for readiness and this session's exclusions.
  const featuredEntitiesQuery = useClaimEntitiesByIds(featuredClaimIds);

  // Only All claims is paged; Recommended comes from the curator's page whole and Featured is one
  // graph query.
  const browsesPages = tab === 'claims' && source === 'all';

  const matchmakingQuery = React.useMemo<Omit<MatchmakingClaimsQuery, 'spaceIds' | 'spaceId'>>(
    // `topicId` is sent whichever tab is showing. It only filters *these* rows, which back the
    // All tab, and the server's topic facet is narrowed by spaces rather than by topics — so a
    // topic selection can never collapse the menu it came from. The other two tabs are built
    // from graph entities geo-chat has never seen, so their topic filter stays client-side.
    () => ({
      search: debouncedSearch || null,
      topicIds,
      // What `excludedClaimIds` removes below, removed by the endpoint instead — so the facets
      // describe the same corpus the rows do. Without it a topic whose every claim in the space
      // was one this session had dropped stayed on the menu over an empty list.
      rematchSessionId: sessionId,
      filter: 'all',
    }),
    [debouncedSearch, sessionId, topicIds]
  );
  // Every way the pages can outlive the scope that fetched them is handled in there, once, for
  // both pickers — see `useScopedMatchmakingClaims`.
  // Deliberately not gated on the source. These rows are merged into All claims, but their facets
  // also feed the space menu and their spaces the gateway scopes this page holds — both of which
  // have to describe every list, not the one in front of the viewer. Only the sentinel is gated,
  // below: paging a corpus that isn't on screen is the part that would be waste.
  const browsedClaimsQuery = useScopedMatchmakingClaims(
    matchmakingQuery,
    scope,
    browsableSpaceIds,
    selectedSpaceShowsNothing
  );
  const { pages: browsedPages, facets: browsedFacets } = browsedClaimsQuery;

  // What geo-chat knows about this session's claims — readiness, the shared-preference and
  // rejection flags, and which ids the session excludes. One batch for the opponent's claims, one
  // for the curated ones; the session's own id-less list covers anything both have answered.
  const opponentClaimsQuery = useDebateRematchClaimsForIds(sessionId, opponentClaimIds);
  const curatedClaimsQuery = useDebateRematchClaimsForIds(sessionId, recommendedClaimIds);
  const featuredClaimsQuery = useDebateRematchClaimsForIds(sessionId, featuredClaimIds);

  // A claim's sides, from the graph. The shape the rest of the page was already drawing.
  const sidesOf = React.useCallback(
    (claimId: string, claimSpaceId: string, responseKind: DebateResponseKind | null): DebateRematchClaimPosition[] =>
      participantSidesOn(positions.byClaim, claimId, claimSpaceId, participants).map(side => ({
        user_id: side.participant.user_id,
        position: side.position,
        position_label:
          side.position === null ? null : responsePositionLabel(side.responseKind ?? responseKind, side.position),
      })),
    [participants, positions.byClaim]
  );

  const excludedClaimIds = React.useMemo(() => {
    const excluded = new Set([
      ...(savedClaimsQuery.data?.excluded_claim_ids ?? []),
      ...(opponentClaimsQuery.data?.excluded_claim_ids ?? []),
      ...(curatedClaimsQuery.data?.excluded_claim_ids ?? []),
      ...(featuredClaimsQuery.data?.excluded_claim_ids ?? []),
    ]);
    const sourceClaimId = sourceDebateQuery.data?.claim.claim_entity_id;
    if (sourceClaimId) excluded.add(sourceClaimId);
    return excluded;
  }, [
    curatedClaimsQuery.data,
    featuredClaimsQuery.data,
    opponentClaimsQuery.data,
    savedClaimsQuery.data,
    session?.recently_rejected_claim_ids,
    sourceDebateQuery.data,
  ]);

  // A claim either side recently rejected stays listed with its request disabled, as geo-chat's
  // own rows flag it; the hub's index knows nothing of this session, so its rows read the list.
  const recentlyRejectedClaimIds = React.useMemo(
    () => new Set(session?.recently_rejected_claim_ids ?? []),
    [session?.recently_rejected_claim_ids]
  );

  // Whether geo-chat's rows carry readiness at all. When they do, a claim its settled batch has no
  // row for has no readiness row either: not ready is the truth, not a guess to send per space.
  // A backend that predates readiness on these rows leaves every claim to the per-space lookup.
  const sessionCarriesReadiness = React.useMemo(() => {
    const rows = [
      ...(savedClaimsQuery.data?.claims ?? []),
      ...(opponentClaimsQuery.data?.claims ?? []),
      ...(curatedClaimsQuery.data?.claims ?? []),
      ...(featuredClaimsQuery.data?.claims ?? []),
    ];
    return rows.length === 0 || rows[0]!.viewer_debate_ready !== undefined;
  }, [curatedClaimsQuery.data, featuredClaimsQuery.data, opponentClaimsQuery.data, savedClaimsQuery.data]);

  // geo-chat's row for a claim, where it has one. It carries the session flags and readiness; the
  // sides on it are replaced by the graph's below, which are fresher by a notification round trip.
  const sessionRowsByClaimId = React.useMemo(
    () =>
      new Map(
        [
          ...(savedClaimsQuery.data?.claims ?? []),
          ...(opponentClaimsQuery.data?.claims ?? []),
          ...(curatedClaimsQuery.data?.claims ?? []),
          ...(featuredClaimsQuery.data?.claims ?? []),
        ].map(claim => [claim.claim.claim_entity_id, claim])
      ),
    [curatedClaimsQuery.data, featuredClaimsQuery.data, opponentClaimsQuery.data, savedClaimsQuery.data]
  );

  // A debate is published into the claim's home space by the acceptor, and a personal space grants
  // editor rights to its owner alone — so a claim living in one can never carry a published debate
  // (see `isDebatePublishableSpace`). Every list is narrowed by this, unlike the viewer-specific
  // allowlist above: it is a property of the claim, so both debaters see the same answer, and
  // offering such a claim spends a debate on a result that quietly evaporates.
  //
  // Every space a claim is named in is looked up, not just the one that currently wins the ranking,
  // because which one wins is the next decision and it needs the types to make it.
  const candidateSpaceIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const entity of [
      ...opponentEntitiesQuery.entities,
      ...recommendedEntities,
      ...featuredEntitiesQuery.entities,
    ]) {
      for (const spaceId of claimCandidateSpaceIds(entity)) ids.add(spaceId);
    }
    for (const page of browsedPages) for (const entry of page.claims) ids.add(entry.claim.space_id);
    for (const row of savedClaimsQuery.data?.claims ?? []) ids.add(row.claim.space_id);
    return [...ids];
  }, [
    browsedPages,
    featuredEntitiesQuery.entities,
    opponentEntitiesQuery.entities,
    recommendedEntities,
    savedClaimsQuery.data,
  ]);
  const { spacesById: candidateSpaces } = useSpacesByIds(candidateSpaceIds);
  const spaceTypePublishable = React.useMemo(() => debatePublishableSpacePredicate(candidateSpaces), [candidateSpaces]);
  const canPublishDebateIn = React.useCallback(
    (spaceId: string | null | undefined) =>
      isSpaceDebatePublishable(spaceId, publishableSpaceIds) && spaceTypePublishable(spaceId),
    [publishableSpaceIds, spaceTypePublishable]
  );

  /**
   * A picker row from a graph entity, with geo-chat's session row layered on when it has one.
   *
   * `preferredSpaceId` overrides the space ranking where the caller already knows which space the
   * claim belongs to it in. Featured passes the space its tag was written in: the ranking picks the
   * highest-ranked space the claim is *named* in, which knows nothing of the viewer's allowlist, so
   * without this a claim featured in an allowed space could be drawn — and its debate requested — in
   * a disallowed one that happens to outrank it. Ignored when a debate could never be published
   * there, since that is the one thing the ranking does already screen for.
   */
  const rowFromEntity = React.useCallback(
    (entity: ClaimPickerEntity, preferredSpaceId?: string): DebateRematchClaim | null => {
      const preferred = preferredSpaceId && canPublishDebateIn(preferredSpaceId) ? preferredSpaceId : null;
      const homeSpaceId = preferred ?? claimHomeSpaceId(entity, canPublishDebateIn);
      if (!entity.name || !homeSpaceId) return null;
      const sessionRow = sessionRowsByClaimId.get(entity.id);
      const responseKind = sessionRow?.response_kind ?? claimResponseKind(entity, homeSpaceId);
      return {
        claim: sessionRow?.claim ?? {
          id: entity.id,
          space_id: homeSpaceId,
          claim_entity_id: entity.id,
          claim: entity.name,
          description: entity.description,
        },
        response_kind: responseKind,
        participants: sidesOf(entity.id, sessionRow?.claim.space_id ?? homeSpaceId, responseKind),
        shared_preference: sessionRow?.shared_preference ?? false,
        recently_rejected: sessionRow?.recently_rejected ?? recentlyRejectedClaimIds.has(entity.id),
        previously_debated: sessionRow?.previously_debated ?? false,
        // These rows only list once their geo-chat batch has settled (see `sessionCarriesReadiness`).
        viewer_debate_ready: sessionRow ? sessionRow.viewer_debate_ready : sessionCarriesReadiness ? false : undefined,
        readiness_disabled_reason: sessionRow ? sessionRow.readiness_disabled_reason : null,
      };
    },
    [canPublishDebateIn, recentlyRejectedClaimIds, sessionCarriesReadiness, sessionRowsByClaimId, sidesOf]
  );

  // Topics live on the KG claim entity, so resolve them here to label each card and drive the
  // "Any topic" filter. A claim can carry several topics. The browsed rows bring their own.
  const topicsByClaimId = React.useMemo(() => {
    const map = new Map<string, MatchmakingTopic[]>();
    for (const entity of [
      ...opponentEntitiesQuery.entities,
      ...recommendedEntities,
      ...featuredEntitiesQuery.entities,
    ]) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    for (const page of browsedPages) {
      for (const entry of page.claims) {
        if (entry.topics.length > 0 && !map.has(entry.claim.claim_entity_id)) {
          map.set(entry.claim.claim_entity_id, entry.topics);
        }
      }
    }
    return map;
  }, [browsedPages, featuredEntitiesQuery.entities, opponentEntitiesQuery.entities, recommendedEntities]);

  // The opponent's tab: every claim they hold a side on, newest first. Held until the session's
  // exclusions are in, so nothing lists and then vanishes. Not narrowed by the space allowlist —
  // see it above.
  const opponentClaimsSettling = opponentClaimsQuery.isLoading || opponentEntitiesQuery.isLoading;
  const opponentClaimsNow = React.useMemo(() => {
    if (opponentClaimsSettling) return [];
    const entitiesById = new Map(opponentEntitiesQuery.entities.map(entity => [entity.id, entity]));
    const rows: DebateRematchClaim[] = [];
    for (const claimId of opponentClaimIds) {
      if (excludedClaimIds.has(claimId)) continue;
      const entity = entitiesById.get(claimId);
      const row = entity ? rowFromEntity(entity) : null;
      if (row && row.participants.some(side => side.user_id !== currentUserId && side.position !== null))
        rows.push(row);
    }
    return rows
      .filter(row => canPublishDebateIn(row.claim.space_id))
      .sort((a, b) => Number(b.shared_preference) - Number(a.shared_preference));
  }, [
    canPublishDebateIn,
    currentUserId,
    excludedClaimIds,
    opponentClaimIds,
    opponentClaimsSettling,
    opponentEntitiesQuery.entities,
    rowFromEntity,
  ]);
  // A new response from the opponent adds an id, and the lookups keyed on the id list start over.
  // The list they were drawn from is still right for every claim already on it, so it stays up
  // until the new one lands rather than dropping to nothing in between.
  const opponentClaimsHeld = useLastSettled(opponentClaimsNow, opponentClaimsSettling, sessionId);
  // The sort above is a load-time arrangement, not a live one (GEO-2698). `shared_preference` is
  // read off the session row, so taking a side on a claim the opponent has already answered flips
  // it — and re-sorting sent the row the viewer had just acted on to the top, carrying the rest of
  // the list with it. Held so that arrangement survives the viewer acting on it; a claim the
  // opponent answers next is new rather than moved, and still lands at the top where the sort puts
  // it. Keyed on the session, so reopening the flow arranges it afresh.
  //
  // Applied after `useLastSettled` rather than before it: the hold remembers the rows it has been
  // shown, and `opponentClaimsNow` empties on every refetch. Stabilising that would hand it an
  // empty list mid-flight and lose the order at the moment it is needed.
  const opponentClaims = useStableListOrder(
    opponentClaimsHeld,
    row => `${row.claim.space_id}:${row.claim.claim_entity_id}`,
    sessionId
  );

  // The curated tab, in the curator's order. Held the same way, and likewise not narrowed by the
  // space allowlist.
  const curatedClaimsSettling = curatedClaimsQuery.isLoading;
  const curatedClaimsNow = React.useMemo(
    () =>
      curatedClaimsSettling
        ? []
        : recommendedClaimIds.flatMap(claimId => {
            if (excludedClaimIds.has(claimId)) return [];
            const entity = recommendedEntities.find(candidate => candidate.id === claimId);
            const row = entity ? rowFromEntity(entity) : null;
            return row && canPublishDebateIn(row.claim.space_id) ? [row] : [];
          }),
    [
      canPublishDebateIn,
      curatedClaimsSettling,
      excludedClaimIds,
      recommendedClaimIds,
      recommendedEntities,
      rowFromEntity,
    ]
  );
  const curatedClaims = useLastSettled(curatedClaimsNow, curatedClaimsSettling, sessionId);

  // Featured, in the order the tag query ranked it. Built exactly as the curated list is — the
  // entities are the same projection and the rows carry the same session flags — and held the same
  // way while its lookups settle.
  //
  // Not merged into All claims the way the curated and opponent lists are. Those are rows the index
  // has not paged to yet and belong in a list of everything; Featured is a few hundred claims the
  // index already knows, so folding them in would pin them above what the viewer searched for.
  //
  // The allowlist is one of its inputs — the ids are empty while it resolves — so it belongs in the
  // settling state, or the empty message paints and is then replaced by the list.
  const featuredClaimsSettling =
    allowlistPending || featuredCatalogLoading || featuredEntitiesQuery.isLoading || featuredClaimsQuery.isLoading;
  const featuredClaimsNow = React.useMemo(
    () =>
      featuredClaimsSettling
        ? []
        : featuredSelection.flatMap(featured => {
            if (excludedClaimIds.has(featured.claimEntityId)) return [];
            const entity = featuredEntitiesQuery.entities.find(candidate => candidate.id === featured.claimEntityId);
            const row = entity ? rowFromEntity(entity, featured.spaceId) : null;
            // Both gates, against the space the row actually carries. `rowFromEntity` takes geo-chat's
            // session row whole where it has one, and that row names its own space — so checking the
            // tag's space alone would let a claim through in one the viewer may not be shown.
            if (!row || !canPublishDebateIn(row.claim.space_id)) return [];
            return isClaimSpaceAllowed(row.claim.space_id, spaceAllowlist) ? [row] : [];
          }),
    [
      canPublishDebateIn,
      excludedClaimIds,
      featuredClaimsSettling,
      featuredEntitiesQuery.entities,
      featuredSelection,
      rowFromEntity,
      spaceAllowlist,
    ]
  );
  const featuredClaims = useLastSettled(featuredClaimsNow, featuredClaimsSettling, sessionId);

  // The All tab: geo-chat's rows, the graph's sides. Held while the allowlist resolves (see above).
  // It is still every claim the picker knows: the session's own rows — what both have answered,
  // the opponent's and the curated lists — join the pages, so a shared preference the index has
  // not paged to yet is on the All tab too.
  //
  // Deliberately unsorted (GEO-2647). Shared preferences used to be pinned to the top, which put
  // them ahead of what the viewer had actually typed and pushed their search results down the
  // list. They stay legible without it: a matched claim is the one offering "Request debate", and
  // the Matches tab exists to list them on their own.
  const browsedRows = React.useMemo(() => {
    if (allowlistPending) return [];
    const rows = new Map<string, DebateRematchClaim>();
    const addPagedEntry = (entry: (typeof browsedPages)[number]['claims'][number]) => {
      const claimId = entry.claim.claim_entity_id;
      if (excludedClaimIds.has(claimId) || !isClaimSpaceAllowed(entry.claim.space_id, spaceAllowlist)) return;
      if (!canPublishDebateIn(entry.claim.space_id)) return;
      const sessionRow = sessionRowsByClaimId.get(claimId);
      rows.set(claimId, {
        claim: entry.claim,
        response_kind: entry.response_kind,
        participants: sidesOf(claimId, entry.claim.space_id, entry.response_kind),
        shared_preference: sessionRow?.shared_preference ?? false,
        recently_rejected: sessionRow?.recently_rejected ?? recentlyRejectedClaimIds.has(claimId),
        previously_debated: sessionRow?.previously_debated ?? false,
        viewer_debate_ready: entry.viewer_debate_ready,
        readiness_disabled_reason: entry.readiness_disabled_reason,
      });
    };

    const [firstPage, ...laterPages] = browsedPages;
    for (const entry of firstPage?.claims ?? []) addPagedEntry(entry);

    const savedRows = (savedClaimsQuery.data?.claims ?? [])
      .filter(
        row =>
          !excludedClaimIds.has(row.claim.claim_entity_id) &&
          isClaimSpaceAllowed(row.claim.space_id, spaceAllowlist) &&
          canPublishDebateIn(row.claim.space_id)
      )
      .map(row => ({
        ...row,
        participants: sidesOf(row.claim.claim_entity_id, row.claim.space_id, row.response_kind),
      }));
    // Merged in after the first page, and they keep that slot. These are rows the index
    // hasn't paged to yet, so appending them after *every* page meant each new batch
    // inserted rows above them and slid them further down the list on each load — a claim
    // the viewer already held a position on was still sinking after ten pages (GEO-2671).
    // A later page carrying the same claim overwrites the row's data but not its position,
    // which is the same precedence as before.
    for (const row of [...savedRows, ...opponentClaims, ...curatedClaims]) {
      if (!rows.has(row.claim.claim_entity_id)) rows.set(row.claim.claim_entity_id, row);
    }

    for (const page of laterPages) {
      for (const entry of page.claims) addPagedEntry(entry);
    }
    return [...rows.values()];
  }, [
    allowlistPending,
    browsedPages,
    canPublishDebateIn,
    curatedClaims,
    excludedClaimIds,
    opponentClaims,
    recentlyRejectedClaimIds,
    savedClaimsQuery.data,
    sessionRowsByClaimId,
    sidesOf,
    spaceAllowlist,
  ]);
  // The server re-sorts on every readiness change, so hold the order the viewer is looking at
  // until they ask for a different list.
  const browsedClaims = useStableListOrder(
    browsedRows,
    row => `${row.claim.space_id}:${row.claim.claim_entity_id}`,
    // Topic belongs in the key for the same reason space does: it goes out as `topic_id`, so the
    // server ranks a different list under it, and holding the previous order would arrange the
    // new one by a ranking the viewer has already moved on from.
    `${debouncedSearch}|${spaceIds.join(',')}|${topicIds.join(',')}`
  );

  // The opponent is whichever participant isn't the local user; with no local user there is none.
  const opponentPositionOf = React.useCallback(
    (claim: DebateRematchClaim) =>
      currentUserId === null
        ? null
        : (claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null),
    [currentUserId]
  );

  const returnFromSession = React.useCallback(
    (endedSession: DebateRematchSession) => {
      if (exitStartedRef.current) return;
      exitStartedRef.current = true;

      const returnDestination = consumeDebateReturnDestination();
      if (returnDestination) {
        router.replace(returnDestination);
        return;
      }

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
    () => opponentClaims.filter(claim => opponentPositionOf(claim) !== null).length,
    [opponentClaims, opponentPositionOf]
  );

  /**
   * GEO-2656. The badge drew `0` from the very first paint, because the count is derived from a
   * list that is empty until three dependent round trips land — positions, then the claim
   * entities, then the session's rematch rows.
   *
   * Zero is not a neutral placeholder here. It is a specific, confident claim — "this person holds
   * no positions" — and it is usually wrong, on the one tab whose whole purpose is their
   * positions. A viewer who reads it and switches away has been told something false.
   *
   * `positions.isLoading` has to be part of this. The two claim lookups are keyed on ids that come
   * *from* positions, so while positions is still in flight the id list is empty, those queries
   * are disabled rather than loading, and nothing downstream reports as pending.
   *
   * `sessionQuery.isLoading` for the same reason, one step further up. Participants come from the
   * session, positions are keyed on participants, and the claim lookups are keyed on positions — so
   * while the session is in flight the whole chain below it is disabled rather than loading and
   * reports nothing. That window is reachable: the route keeps this component when it moves between
   * rematches, and the held list is dropped on the way (see `useLastSettled`), so without this the
   * badge answers `0` for a session it has not read yet.
   *
   * Once a settled list exists the number is shown even while a refetch is in flight: a new
   * response from the opponent restarts the lookups, and `useLastSettled` is still holding a list
   * that is correct for every claim already on it. Going back to a skeleton there would flicker
   * the badge on exactly the event that ought to be invisible.
   */
  const opponentCountPending =
    opponentClaims.length === 0 && (sessionQuery.isLoading || positions.isLoading || opponentClaimsSettling);

  // Recommended is offered only when a curator has a page for this pairing; the order is fixed, so
  // a source that appears doesn't reshuffle the ones already in the menu.
  const sourceOptions = React.useMemo<HubFilterOption<ClaimsSource>[]>(
    () =>
      (hasRecommended ? (['recommended', 'featured', 'all'] as const) : (['featured', 'all'] as const)).map(value => ({
        value,
        label: CLAIMS_SOURCE_LABELS[value],
      })),
    [hasRecommended]
  );

  const claims =
    tab === 'opponent'
      ? opponentClaims
      : source === 'recommended'
        ? curatedClaims
        : source === 'featured'
          ? featuredClaims
          : browsedClaims;

  // Every space the lists have shown, not only the current tab's. Space runs in the browsed query,
  // so the loaded corpus is whatever the current filter allows — a menu listing only the space you
  // picked would have no way back to another. Topics need no equivalent: their filter is applied
  // here rather than in the query, so narrowing them never costs the viewer their way back — and
  // remembering them anyway kept offering topics from spaces the viewer had filtered away, where
  // picking one could only ever produce an empty list (GEO-2653).
  //
  // The two provenances are held apart because they are gated differently below. A space that
  // reached the menu through a *row* has already passed whatever its own tab requires, and the
  // opponent and curated tabs are deliberately not narrowed by the viewer's allowlist — so
  // re-applying it would drop the space of a claim those tabs are still showing.
  const seenFacetsRef = React.useRef<{ rowSpaceIds: Set<string>; facetSpaceIds: Set<string> }>({
    rowSpaceIds: new Set(),
    facetSpaceIds: new Set(),
  });

  const facetSpaceIds = React.useMemo(() => {
    const { rowSpaceIds, facetSpaceIds: fromFacet } = seenFacetsRef.current;
    for (const claim of [...opponentClaims, ...curatedClaims, ...featuredClaims, ...browsedClaims])
      rowSpaceIds.add(claim.claim.space_id);
    for (const id of browsedFacets?.space_ids ?? []) fromFacet.add(id);

    // Filtered on the way out, not on the way in. Both gates answer `true` while their lookup is
    // still resolving — deliberately, so a slow answer doesn't empty the panel — and these sets
    // only ever grow, so gating the writes would admit every space on the first render and never
    // take one back.
    //
    // Safe against an accumulated set: neither gate narrows with the viewer's selection, which is
    // the reason the accumulation exists.
    const menu = new Set<string>();
    // A row's space is already through its own tab's gates; publishability is re-checked because
    // it can resolve after the row landed, and the allowlist is not because the graph-backed tabs
    // are not narrowed by it.
    for (const id of rowSpaceIds) if (canPublishDebateIn(id)) menu.add(id);
    for (const id of fromFacet) if (isClaimSpaceAllowed(id, spaceAllowlist) && canPublishDebateIn(id)) menu.add(id);
    return [...menu];
  }, [
    browsedClaims,
    browsedFacets?.space_ids,
    canPublishDebateIn,
    curatedClaims,
    featuredClaims,
    opponentClaims,
    spaceAllowlist,
  ]);

  // The menu's ids with counts against them. The server counts the browsed corpus; anything only
  // the rows know about is counted from the rows, which is all there is to count — see
  // `mergeFacetCounts` for why the two are not summed.
  const facetSpaces = React.useMemo(() => {
    const offered = new Set(facetSpaceIds);
    // Narrowed by the topic and the search, never by the space selection — the mirror of
    // `topicFacetClaims`, and the rule the server counts by: a dimension is never narrowed by
    // itself, or picking one space would empty the menu it was picked from.
    const fromRows = countBy(
      claims
        .filter(claim => {
          if (!offered.has(claim.claim.space_id)) return false;
          if (
            topicIds.length > 0 &&
            !(topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).some(topic => topicIds.includes(topic.id))
          )
            return false;
          if (
            !browsesPages &&
            debouncedSearch &&
            !claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase())
          )
            return false;
          return true;
        })
        .map(claim => ({ id: claim.claim.space_id, name: null }))
    );
    const fromServer = (browsedFacets?.space_facets ?? []).filter(facet => offered.has(facet.id));
    const merged = mergeFacetCounts(browsesPages ? fromServer : [], fromRows);
    // Absent options stay absent — one the other filters leave empty could only ever produce an
    // empty list. An absent *selection* comes back at zero, or its checkbox disappears while the
    // trigger goes on counting it, and it can't be unticked without clearing every space.
    return orderFacetOptions(keepSelectedVisible(merged, spaceIds), spaceIds);
  }, [browsedFacets?.space_facets, claims, debouncedSearch, facetSpaceIds, spaceIds, tab, topicIds, topicsByClaimId]);

  // A space picked while the gates were still passing everything has to be let go once they
  // reject it, or it keeps going out as `space_id` on every request while its rows are dropped.
  React.useEffect(() => {
    if (allowlistPending) return;
    setSpaceIds(current => {
      const offered = new Set(facetSpaceIds);
      const kept = current.filter(id => offered.has(id));
      return kept.length === current.length ? current : kept;
    });
  }, [allowlistPending, facetSpaceIds]);

  // The claims the topic menu describes on the graph-backed tabs: everything the other filters
  // allow, topic aside. Narrowing by the current topic too would collapse the menu to the one
  // option already chosen. The tab matters — each is a different corpus, and a topic only the
  // opponent's tab holds is not an option while looking at the curated one.
  const topicFacetClaims = React.useMemo(
    () =>
      claims.filter(claim => {
        if (spaceIds.length > 0 && !spaceIds.includes(claim.claim.space_id)) return false;
        // Cut on the same terms `visibleClaims` is, or the menu stops describing the list. On the
        // All tab the search runs server-side over the browsed rows, and the pinned ones are
        // merged in whether they match it or not — so cutting them here left a row on screen with
        // its topics missing from the menu, which is the merge below undone.
        if (
          !browsesPages &&
          debouncedSearch &&
          !claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
          return false;
        return true;
      }),
    [browsesPages, claims, debouncedSearch, spaceIds]
  );

  // The All tab takes its menu from the server, which knows the whole filtered corpus rather
  // than the pages this client has walked — the difference GEO-2653 was about. The other two
  // tabs are built from graph entities geo-chat has never heard of, so they still derive theirs.
  //
  // Ordered by count with the picked ones pinned, the same as the Claims tab.
  // Counted from the rows the tab would show, which is the only count available for a claim
  // geo-chat has never seen.
  const rowTopicCounts = React.useMemo(
    () =>
      countBy(
        topicFacetClaims.flatMap(claim =>
          (topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).map(topic => ({ id: topic.id, name: topic.name }))
        )
      ),
    [topicFacetClaims, topicsByClaimId]
  );

  const facetTopics = React.useMemo(() => {
    const rowCounts = rowTopicCounts;
    if (!browsesPages) return orderFacetOptions(rowCounts, topicIds);

    // Both, because neither is the whole answer. The facet covers claims no page has reached,
    // which the rows cannot; the rows cover this session's saved, opponent and curated claims,
    // pinned in front of the browsed ones and unknown to geo-chat, which the facet cannot. A
    // topic carried only by one of those was on screen with no way to filter to it.
    //
    // Adding rows can't reintroduce an empty option: every topic here comes from a claim the
    // other filters already allow, so picking it leaves at least that one behind.
    return orderFacetOptions(mergeFacetCounts(browsedFacets?.topic_facets ?? [], rowCounts), topicIds);
  }, [browsedFacets?.topic_facets, browsesPages, rowTopicCounts, topicIds]);

  // Search and space reach the browsed query; on the other tabs, and for the topic everywhere
  // (geo-chat doesn't model topics), they are applied here.
  const visibleClaims = React.useMemo(
    () =>
      claims.filter(claim => {
        if (spaceIds.length > 0 && !spaceIds.includes(claim.claim.space_id)) return false;
        // Kept even on the All tab, where the query has already applied it. That tab is the
        // browsed rows *plus* this session's claims pinned in front of them, and the pinned ones
        // never went through the query — without this they survive a topic filter they don't
        // match. A no-op for the rows the server did filter, which match by construction.
        if (
          topicIds.length > 0 &&
          !(topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).some(t => topicIds.includes(t.id))
        )
          return false;
        if (
          !browsesPages &&
          debouncedSearch &&
          !claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
          return false;
        return true;
      }),
    [browsesPages, claims, debouncedSearch, spaceIds, topicIds, topicsByClaimId]
  );

  const hasFilters = Boolean(debouncedSearch || spaceIds.length || topicIds.length);

  // Only All claims pages, so the sentinel exists only under it.
  const hasNextPage = browsesPages && browsedClaimsQuery.hasNextPage;

  const sentinelRef = useInfiniteScrollSentinel({
    // Masked for the same reason the pages are: the retained `hasNextPage` outlives the scope it
    // described, and `fetchNextPage` is a manual call that ignores `enabled` — so a sentinel left
    // in view would page the unscoped corpus the moment it was scrolled to.
    hasNextPage,
    isFetchingNextPage: browsedClaimsQuery.isFetchingNextPage,
    fetchNextPage: browsedClaimsQuery.fetchNextPage,
  });

  // Each tab draws from a different set of queries, so each waits on its own. The allowlist narrows
  // the All tab alone now, so only that one waits for it.
  const tabIsLoading =
    sessionQuery.isLoading ||
    (tab === 'opponent'
      ? positions.isLoading || opponentEntitiesQuery.isLoading || opponentClaimsQuery.isLoading
      : sourceUndecided ||
        (source === 'recommended'
          ? recommendedLoading || curatedClaimsQuery.isLoading
          : source === 'featured'
            ? featuredClaimsSettling
            : scope.pending || browsedClaimsQuery.isLoading));

  // A topic the menu no longer offers is unpickable as well as empty — the chip filtering the
  // list would not be in the menu to clear. Unlike the Claims tab, the topics here arrive with
  // the claim rows rather than in a lookup behind them, so once the tab has settled an empty
  // menu is a real answer.
  React.useEffect(() => {
    // The All tab's menu is only as settled as the facets behind it; the other two have no facet
    // to wait on, so their own loading state is the whole answer.
    const resolved = browsesPages ? browsedClaimsQuery.facetsSettled && !tabIsLoading : !tabIsLoading;
    setTopicIds(current => keepSelectableTopics(current, facetTopics, resolved));
  }, [browsedClaimsQuery.facetsSettled, browsesPages, facetTopics, tabIsLoading]);

  const tabError =
    sessionQuery.error ??
    (tab === 'opponent'
      ? (positions.error ?? opponentEntitiesQuery.error)
      : source === 'all'
        ? browsedClaimsQuery.error
        : source === 'featured'
          ? (featuredCatalogError ?? featuredEntitiesQuery.error ?? featuredClaimsQuery.error)
          : curatedClaimsQuery.error);

  // The curated tab groups by block rather than listing flat, but narrows on the same filters.
  const showsSections = tab === 'claims' && source === 'recommended';
  const visibleSections = React.useMemo(() => {
    if (!showsSections) return [];
    const visibleById = new Map(visibleClaims.map(claim => [claim.claim.claim_entity_id, claim]));

    return recommendedSections
      .map(section => ({
        ...section,
        claims: section.claimIds
          .map(claimId => visibleById.get(claimId))
          .filter((claim): claim is DebateRematchClaim => claim !== undefined),
      }))
      .filter(section => section.claims.length > 0);
  }, [recommendedSections, showsSections, visibleClaims]);

  // `debate.claims_changed` is delivered per space, and it is what turns the opponent's new
  // response into a refresh of this page rather than something the poll finds up to twenty seconds
  // later. So hold a scope on every space the picker could see one land in:
  //
  // - every space any of the three lists shows, not just the tab in front of the viewer. Keyed on
  //   the visible tab alone, switching tabs dropped the scopes the other lists depend on.
  // - both participants' personal spaces, whether or not a claim from them is listed yet. A
  //   debater's own claims live there, and the tab starts empty precisely in the case this is
  //   about — the opponent taking their *first* position — so there would be no claim to derive the
  //   scope from at the moment it matters.
  const { authenticated: geoChatAuthenticated } = useGeoChatAuth();
  const scopedSpaceIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const claim of [...opponentClaims, ...curatedClaims, ...featuredClaims, ...browsedClaims])
      ids.add(claim.claim.space_id);
    for (const participant of participants) ids.add(participant.profile_space_id);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [browsedClaims, curatedClaims, featuredClaims, opponentClaims, participants]);
  useDebateGatewaySpaceScopes(scopedSpaceIds, geoChatAuthenticated && scopedSpaceIds.length > 0);

  // Readiness drives the card's Debate toggle. geo-chat now carries it on the rematch claims
  // response itself; the per-space debate-claims endpoint is the fallback for a backend that
  // predates that, and it costs one query per space on screen.
  const { byClaimId: readinessByClaimId, unresolved: readinessUnresolved } = useClaimReadinessByClaimId({
    claims,
    unresolved:
      tab === 'opponent'
        ? opponentClaimsQuery.isLoading || Boolean(opponentClaimsQuery.error)
        : source === 'all'
          ? browsedClaimsQuery.isLoading || Boolean(browsedClaimsQuery.error)
          : source === 'featured'
            ? featuredClaimsQuery.isLoading || Boolean(featuredClaimsQuery.error)
            : curatedClaimsQuery.isLoading || Boolean(curatedClaimsQuery.error),
  });

  React.useEffect(() => {
    if (!session) return;
    if (session.status === 'converted' && session.converted_debate_id) {
      // The requester walks into the room the same way the accepter does, and without the intent
      // `DebateCoordinator` reads the walk as an unannounced debate and reopens the dialog.
      markEnteringDebate(session.converted_debate_id);
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
    // `overflow-x-hidden` is load-bearing, not tidying: CSS computes the other axis to `auto` as
    // soon as one of them isn't `visible`, so `overflow-y-auto` alone left this layer horizontally
    // scrollable. Anything wider than the viewport — the tab strip, on a phone — panned the whole
    // screen sideways instead of scrolling itself.
    <div className="fixed inset-0 z-[150] overflow-x-hidden overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 pt-8 pb-8 sm:px-8">
        {/* Pinned together, tabs included. The list pages forever, so both the tab strip and the
            controls under it were a full scroll away by the time the viewer wanted either — and
            pinning the filters alone would have left them floating over a tab strip scrolling
            past behind them. Bleeds to the layer's edges so the page passes under it rather than
            beside it, and `-mt-8` lets it sit flush at the top once stuck. */}
        <div className="sticky top-0 z-20 -mx-5 -mt-8 bg-white px-5 pt-8 pb-3 sm:-mx-8 sm:px-8">
          <header className="mb-4 flex items-center justify-between gap-4">
            <h1 className="sr-only">Rematch {remoteName}</h1>
            {/* Scrolls on its own: `min-w-0` lets it be narrower than its tabs, `overflow-x-auto`
                gives those tabs somewhere to go, and `overscroll-x-contain` stops a swipe that
                reaches the end from chaining into the browser's back gesture. */}
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-5 overflow-x-auto overscroll-x-contain">
              <TabButton active={tab === 'claims'} onClick={() => setTab('claims')}>
                Claims
              </TabButton>
              <TabButton active={tab === 'opponent'} onClick={() => setTab('opponent')}>
                <span className="max-w-[10rem] truncate">{firstNamePossessive(remoteName)} positions</span>
                <span
                  className={cx(
                    'inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-metadataMedium tabular-nums',
                    tab === 'opponent' ? 'bg-text text-white' : 'bg-grey-01 text-grey-04'
                  )}
                >
                  {/* The badge keeps its size either way, so the strip doesn't reflow when the
                      number lands. See `opponentCountPending`: a skeleton says "still counting",
                      where `0` said "none" and was usually wrong. */}
                  {opponentCountPending ? (
                    <Skeleton radius="rounded-full" className="h-3 w-3" aria-label="Counting positions" />
                  ) : (
                    opponentPositionCount
                  )}
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

          <div className="flex flex-col gap-3">
            <SpaceTopicFilters
              spaceIds={spaceIds}
              onSpaceToggle={id => setSpaceIds(current => toggleId(current, id))}
              onSpacesClear={() => setSpaceIds([])}
              topicIds={topicIds}
              onTopicToggle={id => setTopicIds(current => toggleId(current, id))}
              onTopicsClear={() => setTopicIds([])}
              facetSpaces={facetSpaces}
              facetTopics={facetTopics}
              topicAtEnd
              // Only on Claims: the opponent's tab is one fixed source — their own responses — and
              // a menu offering three others there would read as filtering a list it can't reach.
              leading={
                tab === 'claims' ? (
                  <HubFilterMenu
                    label={CLAIMS_SOURCE_LABELS[source]}
                    options={sourceOptions}
                    value={source}
                    onChange={setChosenSource}
                  />
                ) : null
              }
            />
            <Input
              withSearchIcon
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              placeholder="Search claims"
              aria-label="Search claims"
            />
          </div>
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
          // Only what the visible tab actually draws from, and only while it has nothing to show.
          // Holding every tab on the slowest query meant the session's own claims — which arrive in
          // one round trip — sat behind a graph-wide scan they don't come from.
          isLoading={tabIsLoading && (showsSections ? visibleSections.length === 0 : visibleClaims.length === 0)}
          error={tabError}
          isEmpty={showsSections ? visibleSections.length === 0 : visibleClaims.length === 0}
          emptyMessage={
            hasFilters
              ? 'No claims match these filters.'
              : tab === 'opponent'
                ? `${remoteName} hasn’t responded yet. When they do, those claims show up here.`
                : source === 'recommended'
                  ? `Nothing recommended for you and ${remoteName} yet.`
                  : source === 'featured'
                    ? 'No featured claims are available to debate yet.'
                    : 'No other eligible claims are available yet.'
          }
          emptyAction={
            hasFilters
              ? {
                  label: 'Clear filters',
                  onClick: () => {
                    setSearch('');
                    setSpaceIds([]);
                    setTopicIds([]);
                  },
                }
              : undefined
          }
        >
          {showsSections ? (
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

        {/* Outside the empty state deliberately: when a filter empties the list, the next page is
            the way out, so the sentinel has to stay reachable. Only on the All tab: the curated
            tab's sections come from the page whole, and the opponent's tab is the whole of what
            the graph knows about them, in one query. Not while the allowlist is pending either —
            the picker is showing a loading state then. */}
        {hasNextPage ? <div ref={sentinelRef} data-testid="claims-scroll-sentinel" className="h-px" /> : null}
        {/* The same skeleton the list shows on first load, so the next batch reads as more of
            the same list arriving rather than a different component. Without it the sentinel
            fires silently and the list just sits there until the page lands. */}
        {browsesPages && browsedClaimsQuery.isFetchingNextPage ? (
          <div className="mt-2" data-testid="claims-next-page-skeleton">
            <HubSkeleton rows={2} />
          </div>
        ) : null}
      </main>

      {session && currentUserId && <RematchVoicePill session={session} currentUserId={currentUserId} />}

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
 * Readiness for every claim on screen, keyed by claim entity id, so the shared card can render its
 * Debate toggle against real state.
 *
 * Read off the rows themselves when they carry it — geo-chat's matchmaking and rematch responses
 * both do, so nothing extra goes over the wire. A row with the field absent comes from a backend
 * that predates it (or from the graph alone); then the per-space debate-claims endpoint is asked
 * about those claims, one query per space.
 */
function useClaimReadinessByClaimId({
  claims,
  unresolved: sourceUnresolved,
}: {
  claims: DebateRematchClaim[];
  /** True while the lookup these rows' readiness comes from is still running or has failed. */
  unresolved: boolean;
}) {
  // Only the rows that don't carry readiness go to the per-space endpoint. While a source is still
  // loading its rows haven't arrived, so there is nothing to ask about yet — which is what stops a
  // guess from spending the very requests this exists to save.
  const claimIdsBySpace = React.useMemo(() => {
    const bySpace = new Map<string, string[]>();
    for (const claim of claims) {
      if (claim.viewer_debate_ready !== undefined) continue;
      const existing = bySpace.get(claim.claim.space_id);
      if (existing) existing.push(claim.claim.claim_entity_id);
      else bySpace.set(claim.claim.space_id, [claim.claim.claim_entity_id]);
    }
    return [...bySpace.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([spaceId, claimIds]) => ({ spaceId, claimIds }));
  }, [claims]);
  const perSpace = useDebateClaimsBySpaces(claimIdsBySpace);

  const byClaimId = React.useMemo(() => {
    const map = new Map<string, ClaimReadinessState>();
    for (const claim of perSpace.claims) {
      map.set(claim.claim_entity_id, {
        viewer_debate_ready: claim.viewer_debate_ready,
        readiness_disabled_reason: claim.readiness_disabled_reason,
      });
    }
    for (const claim of claims) {
      if (claim.viewer_debate_ready === undefined) continue;
      map.set(claim.claim.claim_entity_id, {
        viewer_debate_ready: claim.viewer_debate_ready,
        readiness_disabled_reason: claim.readiness_disabled_reason ?? null,
      });
    }
    return map;
  }, [claims, perSpace.claims]);

  // A claim missing from a settled lookup genuinely has no readiness row, so `false` is the truth.
  // Missing while a lookup is still running or has failed means we don't know, and a switch drawn
  // from a guess is worse than one that waits.
  const unresolved = sourceUnresolved || perSpace.isLoading || perSpace.isError;
  return { byClaimId, unresolved };
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
  // geo-chat validates against its own copy of your position, which trails the optimistic one by a
  // publish, an index, and a notification. Acting before it agrees earns "respond to this claim
  // before requesting a rematch". Comparing rather than null-checking also covers switching sides,
  // where geo-chat still holds the side you just moved off — equally invalid to act on.
  const responseSettled = serverLocalPosition === localPosition;
  const canRequest = opposing && responseSettled;
  /**
   * GEO-2652. The side you picked highlights immediately off the optimistic answer, but the request
   * has to wait for geo-chat's copy, which trails by a publish, an index and a notification. That
   * is not a moment — it is an on-chain write and an indexer.
   *
   * This used to render nothing at all, on the reasoning that a button you cannot press yet reads
   * as broken and the wait is short. The first half holds; the second does not. So say what is
   * happening instead of showing an empty space where the button will be: Preston's report is
   * precisely that the viewer has no idea what they are waiting on.
   *
   * Not made optimistic, which the ticket would prefer, because it cannot be done from here.
   * geo-chat validates the request against its *own* copy of the position and rejects it with
   * `claim_response_required` — so a request sent early does not race ahead, it fails. Accepting one
   * before the response is indexed is a backend decision about whether a debate may be created on a
   * position that does not exist on-chain yet.
   */
  const responseIndexing = useEntityResponseIndexingSnapshot({
    entityId: claim.claim.claim_entity_id,
    spaceId: claim.claim.space_id,
    responseKind,
  });
  const awaitingResponse = opposing && !responseSettled;
  // Two phases, named for what is actually happening in each. `delayed` is only reachable from the
  // response mutation's `onSuccess` — `reconcileResponseIndexing` runs after `run.status =
  // 'success'` and sets it when the indexer hasn't confirmed in time — so by then the publish has
  // landed and the wait is the index. Saying "still publishing" there would point the viewer at a
  // transaction that already succeeded.
  const awaitingLabel =
    responseIndexing.status === 'delayed' ? 'Still confirming your position…' : 'Publishing your position…';
  const { openSidePanel } = useEntitySidePanel();
  const request = session?.request;

  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

  const positions = React.useMemo(
    () => rematchPositionSummaries(claim, session, responseKind),
    [claim, responseKind, session]
  );

  // geo-chat's copy, deliberately — not `localPosition`. The card reads the viewer's own in-flight
  // response off the indexing snapshot for display, and uses this field for the two questions only
  // the server can answer: whether it is safe to send readiness yet, and whether the position
  // summaries already count the viewer. Handing it the optimistic answer claimed the server agreed
  // the instant the viewer clicked, which sent readiness before there was an indexed response to
  // hang it on and suppressed the optimistic avatar the card would otherwise add.
  const readiness: MatchmakingReadiness = {
    response_kind: responseKind,
    viewer_response:
      serverLocalPosition === null
        ? null
        : { position: serverLocalPosition, position_label: responsePositionLabel(responseKind, serverLocalPosition) },
    viewer_debate_ready: claimReadiness?.viewer_debate_ready ?? false,
    readiness_disabled_reason: claimReadiness?.readiness_disabled_reason ?? null,
  };

  // The picker has no active-debate signal of its own, so this is the one place both readiness
  // paths read it from — the switch and the opt-in below must gate on the same thing, or the
  // opt-in could stand the viewer up on a claim the switch is refusing.
  const activeDebate = false;

  useReadinessOnFirstPosition({
    claim: claim.claim,
    readiness,
    canEnable: !activeDebate,
    localPosition,
    // The optimistic copy exists only while this client's own submission is in flight, so it is
    // what separates "the viewer just picked this side" from "we just learned the side they already
    // held" — which is what a position looks like when their identity or geo-chat's copy lands late.
    pickedHere: optimisticResponse !== undefined,
    alreadyReady: claimReadiness?.viewer_debate_ready ?? false,
  });

  return (
    <MatchmakingClaimCard
      claim={claim.claim}
      positions={positions}
      readiness={readiness}
      activeDebate={activeDebate}
      // `positions` locates the viewer by geo-chat user id, which is null until the token exchange
      // lands. Until then `serverLocalPosition` reads as "no position" for someone the summaries
      // may already count, and the card would draw them onto a second side.
      viewerIdentityPending={currentUserId === null}
      // Reading a claim shouldn't cost the session: navigating to its entity page would leave the
      // rematch behind, so open it beside the picker instead.
      onOpenClaim={() => openSidePanel(claim.claim.claim_entity_id, claim.claim.space_id, false)}
      // Rather than draw the switch off on a guess. Only while this claim's readiness is genuinely
      // unknown — a settled lookup that simply has no row for it really does mean "not ready".
      hideReadinessToggle={claimReadiness === null && readinessUnresolved}
      footer={
        awaitingResponse || canRequest || requesting ? (
          <div className="mt-3">
            {/* GEO-2697. The wait lives on the control it is blocking. This used to be a separate
                spinner line rendered *instead* of the button, which left the viewer watching a
                message in one place for a button that wasn't on screen yet — nothing connected the
                two. `HubPillButton` already disables and sets `aria-busy` while pending, so the
                button carries the whole state: named while it waits, pressable when it doesn't. */}
            <HubPillButton
              onClick={onRequest}
              disabled={!canRequest || busy || requesting || claim.recently_rejected}
              pending={requesting || awaitingResponse}
              pendingLabel={requesting ? 'Requesting…' : awaitingLabel}
              className="w-full"
            >
              Request debate
            </HubPillButton>
            {/* The button's own label changes, but a disabled control nobody is focused on
                announces nothing. This is what actually reaches a screen reader, and it is why the
                wait is still a `status` even though it is no longer drawn as one. */}
            {awaitingResponse && !requesting ? (
              <span role="status" aria-live="polite" className="sr-only">
                {awaitingLabel}
              </span>
            ) : null}
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
 *
 * Recorded through the card's own readiness intent rather than sent from here. The two would
 * otherwise both stand the viewer up on the same claim — the switch holds an intent through
 * publishing now, so a viewer who took a side and pressed it would have queued twice — and the
 * intent already owns the wait for geo-chat to catch up, which this used to duplicate.
 */
function useReadinessOnFirstPosition({
  claim,
  readiness,
  canEnable,
  localPosition,
  pickedHere,
  alreadyReady,
}: {
  claim: DebateClaimSummary;
  readiness: MatchmakingReadiness;
  /** Must match what the card's switch gates on, so the two can't disagree about the same claim. */
  canEnable: boolean;
  localPosition: boolean | null;
  /** Whether {@link localPosition} is this client's own in-flight submission. */
  pickedHere: boolean;
  alreadyReady: boolean;
}) {
  const { setReady } = useClaimDebateReadiness({
    readiness,
    entityId: claim.claim_entity_id,
    spaceId: claim.space_id,
    canEnable,
  });
  // Seeded with the position held on mount, so arriving with one is not a transition.
  const previousPosition = React.useRef(localPosition);
  const optedIn = React.useRef(false);

  React.useEffect(() => {
    const previous = previousPosition.current;
    previousPosition.current = localPosition;

    const justEstablished = previous === null && localPosition !== null;
    // A position can appear without anyone picking anything: the viewer's id resolves a beat after
    // mount, or geo-chat's copy of a claim they had already answered lands late. Both look exactly
    // like a fresh pick from here, and standing them ready for either silently undoes a stand-down
    // they made elsewhere — the thing this hook is careful not to do.
    if (!justEstablished || !pickedHere || alreadyReady || optedIn.current) return;

    optedIn.current = true;
    setReady(true);
  }, [alreadyReady, localPosition, pickedHere, setReady]);
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
      // Only meaningful for the hub's "available now" counts; a rematch is already a fixed pair,
      // so there is nobody here the viewer would send a request to.
      available_now_count: 0,
      // The people this surface knows are on the side, which is what the stack draws. It has to be
      // its own number rather than reusing `available_now_count`: that is 0 here, and while the
      // stack was gated on it these faces were silently never rendered.
      present_count: participants.length,
      participants,
    };
  });
}

/**
 * The space a claim actually lives in.
 *
 * Everything the picker does with a claim is scoped to one space — the response is published
 * against it, geo-chat keys its claim row and readiness on it, and the "Is factual" value that
 * decides the response kind is read from it. Getting it wrong means responding in one space and
 * asking to debate in another, which the server answers with "respond to this claim in this space
 * before enabling debate readiness".
 *
 * `entity.spaces` can't answer it: it is ordered by a fixed space ranking and counts every space
 * holding *any* value or even an inbound relation, so `spaces[0]` is a space that merely mentions
 * the claim whenever that space outranks the claim's own — a Podcasts claim cited from Root or
 * Crypto resolves to those. Prefer the spaces where the claim is actually named, which is how the
 * entity side panel scopes the same entity.
 *
 * `canPublishIn`, where given, is consulted before the ranking. A claim named in both a personal
 * space and a public one is a real case — a debater publishes into their own space and a curator
 * later adds the claim to a shared one — and the space ranking has no opinion on which to pick:
 * neither is in its table, so the tie falls to array order. Picking the personal space there loses a
 * claim that is perfectly debatable in the public one, since the home space is exactly what decides
 * where the debate is published. So: rank among the spaces that could receive it, and fall back to
 * the plain ranking when none can, which leaves the claim to be filtered out on its merits rather
 * than resolving to no space at all.
 */
function claimHomeSpaceId(
  entity: {
    spaces: string[];
    values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
  },
  canPublishIn?: (spaceId: string) => boolean
): string | null {
  const named = [...claimNamedSpaceIds(entity)];
  const publishable = canPublishIn ? (ids: string[]) => ids.filter(canPublishIn) : (ids: string[]) => ids;

  return (
    getTopRankedSpaceId(publishable(named)) ??
    getTopRankedSpaceId(named) ??
    getTopRankedSpaceId(publishable(entity.spaces)) ??
    getTopRankedSpaceId(entity.spaces) ??
    null
  );
}

/** The spaces a claim is actually named in — where it lives, as opposed to where it is mentioned. */
function claimNamedSpaceIds(entity: {
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
}): Set<string> {
  const namedSpaceIds = new Set<string>();
  for (const value of entity.values ?? []) {
    if (
      value.isDeleted !== true &&
      uuidToHex(value.property.id) === uuidToHex(SystemIds.NAME_PROPERTY) &&
      typeof value.value === 'string' &&
      value.value.trim().length > 0
    ) {
      namedSpaceIds.add(value.spaceId);
    }
  }
  return namedSpaceIds;
}

/**
 * Every space a claim could resolve its home to. The publishability lookup covers all of them, so
 * {@link claimHomeSpaceId} has the types it needs to choose between them rather than choosing first
 * and discovering afterwards that the space it picked can never receive the debate.
 */
function claimCandidateSpaceIds(entity: {
  spaces: string[];
  values?: Array<{ isDeleted?: boolean; property: { id: string }; spaceId: string; value: string }>;
}): string[] {
  return [...new Set([...claimNamedSpaceIds(entity), ...entity.spaces])];
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
        // `shrink-0` so a narrow screen scrolls the strip rather than squeezing three tabs into
        // the width of one; `whitespace-nowrap` so a two-word tab can't wrap into two lines.
        'flex shrink-0 items-center gap-2 text-[1.4rem] leading-tight font-medium whitespace-nowrap transition-colors',
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
