'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { useRouter } from 'next/navigation';

import { TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { claimResponseKind } from '~/core/claims/response-kind';
import { FEATURED_TAG_ID } from '~/core/constants';
import {
  type DebateClaimPositionSummary,
  type DebateRematchClaim,
  type DebateRematchClaimPosition,
  type DebateRematchParticipant,
  type DebateRematchSession,
  type DebateResponseKind,
  type MatchmakingReadiness,
  type MatchmakingTopic,
} from '~/core/debates/api';
import { type ClaimPickerEntity, useClaimEntitiesByIds } from '~/core/debates/claim-picker-page';
import { isClaimSpaceAllowed } from '~/core/debates/claim-space-allowlist';
import { markEnteringDebate } from '~/core/debates/debate-entry-intent';
import { useDebateGatewaySpaceScopes } from '~/core/debates/debate-gateway';
import { debatePublishableSpacePredicate } from '~/core/debates/debate-publish-target';
import { DebateRequestDialog } from '~/core/debates/debate-request-dialog';
import { consumeDebateReturnDestination } from '~/core/debates/debate-return-navigation';
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
import { HubQueryState } from '~/core/debates/matchmaking/hub-states';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import {
  carriesEveryTopic,
  countBy,
  keepSelectableTopics,
  keepSelectedVisible,
  orderFacetOptions,
  toggleId,
} from '~/core/debates/matchmaking/topic-facets';
import { useDebouncedSearch } from '~/core/debates/matchmaking/use-debounced-search';
import { useDebouncedSelection } from '~/core/debates/matchmaking/use-debounced-selection';
import { useStableListOrder } from '~/core/debates/matchmaking/use-stable-list-order';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import { participantSidesOn, useParticipantPositions } from '~/core/debates/participant-positions';
import { REQUEST_PENDING_LABEL, debateRequestGate, useRequestGateGrace } from '~/core/debates/request-gate';
import { useRecommendedClaimSections } from '~/core/debates/recommended-claims';
import {
  type TaggedClaimFilters,
  tagDisplaySpaceId,
  useTaggedClaims,
  useTaggedSpaceFacet,
  useTaggedTopicFacet,
} from '~/core/debates/tagged-claims';
import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useEntityResponse, useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { uuidToHex } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';
import { validateEntityId } from '~/core/utils/utils';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';
import { Text } from '~/design-system/text';

import { RematchVoicePill } from './rematch-voice';

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
  const { value: debouncedSearch, pending: searchSettling } = useDebouncedSearch(search);

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
  // The viewer's own personal space id, so `useParticipantPositions` can show their in-flight
  // writes without waiting on the indexer (GEO-2784). Derived before the hook because the overlay
  // has to be attributed to somebody — an unattributed optimistic row would be filtered straight
  // back out by `participantSidesOn`, which matches on the current participants' space ids.
  const localParticipant =
    currentUserId === null ? null : (participants.find(participant => participant.user_id === currentUserId) ?? null);
  const positions = useParticipantPositions(participants, localParticipant?.profile_space_id ?? null);

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
  const { publishableSpaceIds } = useDebatePublishableSpaces();

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
  // Both graph-sourced options, one pipeline (GEO-2771).
  //
  // Featured and All are the same question asked of two tags — which claims carry it — so All joins
  // the machinery Featured already had rather than paging geo-chat's whole corpus for a list of 312.
  // Recommended is the exception: it is the curator's own page, not a tag.
  //
  // Gated on the tab too: a remembered source shouldn't keep a graph query alive behind the
  // opponent's positions, which draw from somewhere else entirely.
  const claimsTagId = source === 'featured' ? FEATURED_TAG_ID : DEBATE_TAG_ID;
  const taggedEnabled = tab === 'claims' && (source === 'featured' || source === 'all') && !sourceUndecided;
  // What goes to the server, so the page and both facet menus describe the same set of spaces.
  //
  // Two of the three gates can be sent; one cannot. The viewer's allowlist and the acceptor's
  // editor spaces are both resolved sets that answer independently of this query. The *space-type*
  // test is the one that cannot go: `spaceTypePublishable` is built from `candidateSpaceIds`, which
  // is derived from this query's own results, so sending it would make the query depend on its own
  // answer. It stays a client gate below.
  //
  // Sending only the allowlist left the topic facet counting claims in spaces the acceptor cannot
  // publish into — topics whose every claim `tagDisplaySpaceId` then drops, so picking one could
  // only ever produce an empty list. That is GEO-2653 again, and the hub already sends the
  // intersection for exactly this reason.
  const eligibleSpaceIds = React.useMemo(() => {
    // `null` from either is "unknown", which must not filter — see `useDebatePublishableSpaces`.
    if (spaceAllowlist === null) return null;
    if (publishableSpaceIds === null) return [...spaceAllowlist];
    return [...spaceAllowlist].filter(spaceId => isSpaceDebatePublishable(spaceId, publishableSpaceIds));
  }, [publishableSpaceIds, spaceAllowlist]);

  const { value: debouncedTopicIds, pending: topicsSettling } = useDebouncedSelection(topicIds);

  const taggedFilters = React.useMemo<TaggedClaimFilters>(
    () => ({ search: debouncedSearch, topicIds: debouncedTopicIds, spaceIds, eligibleSpaceIds }),
    [debouncedSearch, debouncedTopicIds, eligibleSpaceIds, spaceIds]
  );

  // One ranked, filtered page of the tag at a time (GEO-2798), carrying its own topics and its
  // "Is factual" value — so there is no entity lookup behind it and no corpus held to show the top
  // of it. Held while the allowlist is still resolving, or the first page would be scoped to every
  // space and then narrowed under the viewer.
  const {
    claims: taggedCatalog,
    isLoading: taggedCatalogLoading,
    error: taggedCatalogError,
    hasNextPage: taggedHasNextPage,
    fetchNextPage: fetchNextTaggedPage,
    isFetchingNextPage: taggedFetchingNextPage,
  } = useTaggedClaims(claimsTagId, taggedFilters, taggedEnabled && !allowlistPending);

  const taggedTopicFacet = useTaggedTopicFacet(claimsTagId, taggedFilters, taggedEnabled && !allowlistPending);
  const taggedSpaceFacet = useTaggedSpaceFacet(claimsTagId, taggedFilters, taggedEnabled && !allowlistPending);

  // The ids on screen, for the one geo-chat lookup this tab still makes.
  const taggedClaimIds = React.useMemo(
    () => taggedCatalog.map(claim => claim.entity.id).filter(validateEntityId),
    [taggedCatalog]
  );

  // No index query here any more (GEO-2771). All claims is the Debate tag, which the graph answers
  // whole, so there is nothing left to page — and with it goes `rematch_session_id`, whose only job
  // was making the endpoint's own exclusions and facets agree with rows it no longer supplies.
  //
  // Dropping that exclusion is deliberate rather than a casualty: `excludedClaimIds` below has
  // always removed the same claims client-side, from the three sources the endpoint never saw.
  // It now covers all four.

  // What geo-chat knows about this session's claims — readiness, the shared-preference and
  // rejection flags, and which ids the session excludes. One batch for the opponent's claims, one
  // for the curated ones; the session's own id-less list covers anything both have answered.
  const opponentClaimsQuery = useDebateRematchClaimsForIds(sessionId, opponentClaimIds);
  const curatedClaimsQuery = useDebateRematchClaimsForIds(sessionId, recommendedClaimIds);
  const taggedClaimsQuery = useDebateRematchClaimsForIds(sessionId, taggedClaimIds);

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
      ...(taggedClaimsQuery.data?.excluded_claim_ids ?? []),
    ]);
    const sourceClaimId = sourceDebateQuery.data?.claim.claim_entity_id;
    if (sourceClaimId) excluded.add(sourceClaimId);
    return excluded;
  }, [
    curatedClaimsQuery.data,
    taggedClaimsQuery.data,
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
      ...(taggedClaimsQuery.data?.claims ?? []),
    ];
    return rows.length === 0 || rows[0]!.viewer_debate_ready !== undefined;
  }, [curatedClaimsQuery.data, taggedClaimsQuery.data, opponentClaimsQuery.data, savedClaimsQuery.data]);

  // geo-chat's row for a claim, where it has one. It carries the session flags and readiness; the
  // sides on it are replaced by the graph's below, which is what the card draws.
  //
  // That replacement used to be justified as the graph being "fresher by a notification round
  // trip". It is not, and has not been since #2348: geo-chat learns a position the moment the write
  // starts, while the graph waits on `web.write.entity_response` (p50 9.9s). The sides are still
  // drawn from the graph — that is the shape the page draws, and both agree in the end — but the
  // *gate* is measured against geo-chat below, because geo-chat is what rejects an early request.
  const sessionRowsByClaimId = React.useMemo(
    () =>
      new Map(
        [
          ...(savedClaimsQuery.data?.claims ?? []),
          ...(opponentClaimsQuery.data?.claims ?? []),
          ...(curatedClaimsQuery.data?.claims ?? []),
          ...(taggedClaimsQuery.data?.claims ?? []),
        ].map(claim => [claim.claim.claim_entity_id, claim])
      ),
    [curatedClaimsQuery.data, taggedClaimsQuery.data, opponentClaimsQuery.data, savedClaimsQuery.data]
  );

  /**
   * geo-chat's own copy of the viewer's position, per claim, kept out of the assembly below so it
   * survives being overwritten by the graph's sides (GEO-2808).
   *
   * Present-but-no-entry is recorded as `null`: geo-chat has a row and holds no position for this
   * viewer, which is an answer. A claim missing from the map entirely is `undefined` — no row yet,
   * which is not. `debateRequestGate` blocks on both and only distinguishes them so a missing row
   * cannot read as a deliberate absence.
   */
  const chatPositionByClaimId = React.useMemo(() => {
    const byClaim = new Map<string, boolean | null>();
    // Every source is a rematch row since #2351 moved paging server-side, and a rematch row lists
    // each session participant's side — so the viewer's is picked out of `participants`. This used
    // to also read `viewer_response` off the hub's paged index, which that change removed.
    for (const row of sessionRowsByClaimId.values()) {
      byClaim.set(
        row.claim.claim_entity_id,
        row.participants.find(side => side.user_id === currentUserId)?.position ?? null
      );
    }
    return byClaim;
  }, [currentUserId, sessionRowsByClaimId]);

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
      ...taggedCatalog.map(claim => claim.entity),
    ]) {
      for (const spaceId of claimCandidateSpaceIds(entity)) ids.add(spaceId);
    }
    return [...ids];
  }, [opponentEntitiesQuery.entities, recommendedEntities, taggedCatalog]);
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

      // A session row names its own space, and this map is keyed on the claim alone — geo-chat
      // answers per session rather than per space, so a claim tagged in two spaces comes back once,
      // under whichever space it was recorded in.
      //
      // Where the caller has already chosen a space, that is the answer: the tagged list is scoped
      // to claims tagged *in* the picked space, so taking a row recorded in another one drew an
      // A-space card under a B-space filter, and a debate requested from it would publish into A.
      // A row for a different space describes a different card, so it is treated as no row at all —
      // the same path a claim geo-chat has never seen already takes. The other three sources pass
      // no preference and are unchanged: there the row's space is the authoritative one.
      const recordedRow = sessionRowsByClaimId.get(entity.id);
      const sessionRow =
        preferred && recordedRow && !sameId(recordedRow.claim.space_id, preferred) ? undefined : recordedRow;
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
  // "Any topic" filter. A claim can carry several topics.
  //
  // Graph-backed claims only. The browsed rows do *not* bring their own, whatever their type says:
  // geo-chat fills `topics: []` on every row and answers about topics in the facet beside them.
  // Reading that the other way round is what emptied the list in GEO-2714, so nothing here should
  // suggest this map can speak for a browsed row — `carriesPickedTopics` below is where they are
  // accounted for.
  const topicsByClaimId = React.useMemo(() => {
    const map = new Map<string, MatchmakingTopic[]>();
    for (const entity of [
      ...opponentEntitiesQuery.entities,
      ...recommendedEntities,
      ...taggedCatalog.map(claim => claim.entity),
    ]) {
      const topics = entity.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => ({ id: relation.toEntity.id, name: relation.toEntity.name ?? null }));
      if (topics.length > 0) map.set(entity.id, topics);
    }
    return map;
    // Graph entities only, and now every row's. geo-chat sends its rows back with `topics: []`, so
    // folding those in never added anything — the topics have to come from the entity or not at all,
    // which is why the saved claims are hydrated above rather than trusted to carry their own.
  }, [opponentEntitiesQuery.entities, recommendedEntities, taggedCatalog]);

  /**
   * Whether a claim survives the topic filter.
   *
   * Every row on this page is now a Knowledge Graph entity — the tagged lists, the curated one and
   * the opponent's — so the client is the only thing that can filter any of them, and its answer is
   * the whole answer.
   *
   * It used to defer to the index for the rows the index supplied, which needed a gate on which
   * list was showing: that query ran on every tab, so its answer would otherwise vouch for graph
   * rows under the *previous* topic selection, and a claim the viewer had just filtered away stayed
   * up until a background request nothing on screen depended on came back. With no paged source
   * there is nothing to defer to and nothing to gate.
   */
  const carriesPickedTopics = React.useCallback(
    (claimEntityId: string) => carriesEveryTopic(topicsByClaimId.get(claimEntityId), topicIds),
    [topicIds, topicsByClaimId]
  );

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
  // The saved hydration counts, but only for All — it is the only source that merges those rows.
  //
  // Without it a warm catalog can settle first, and `keepSelectableTopics` reconciles against a menu
  // built while the saved rows still look topicless: it drops the viewer's topic selection, and the
  // rows it was about vanish. The other sources never see those rows, so waiting for them there
  // would hold Featured behind a lookup it does not use.
  // All merges four sets, and three of them carry their topics only through an entity lookup — so
  // the tab is settled when *every* one of those has answered, not just the tagged one.
  //
  // The saved, opponent and curated rows are all in this list, and `topicsByClaimId` is built from
  // their entities. Miss one and `keepSelectableTopics` reconciles against a menu those rows have
  // not contributed to yet, dropping the viewer's topic selection and the rows it was about. The
  // opponent's is the one that moves: a new response remints its id list, which empties `entities`
  // until the batch lands.
  //
  // Only for All, because only All merges them. Featured would otherwise wait on lookups it never
  // shows.
  // The three merged lists, each waited on from the top of its own chain rather than at its last
  // link. A hydration lookup is keyed on ids that come from the query above it, so while that query
  // is in flight the id list is empty, the lookup is disabled rather than loading, and it reports
  // `isLoading: false` — the same trap `opponentCountPending` documents below, reached from here.
  //
  // Left at the last link, All was "settled" in the window before the saved rows or the opponent's
  // positions had arrived: the topic reconciliation then ran against a menu those rows had not
  // contributed to yet, and dropped a selection they would have kept.
  //
  // `recommendedLoading` is the deliberate exception — the parent of the curated branch, and not
  // waited on. Recommended is a curator's page for this pairing, offered when it exists; blocking
  // the whole All list on a lookup that may find nothing is worse than the narrow reconciliation
  // window it would close, and there is a test holding All open while that lookup is slow.
  // The tag's own page, and the one geo-chat lookup that rides with it. No merge to wait on any
  // more: the Claims tab is the graph's list (GEO-2798), so what used to be three extra sources
  // waited on here now has nowhere to arrive from.
  const taggedClaimsSettling = allowlistPending || taggedCatalogLoading || taggedClaimsQuery.isLoading;

  // Which space each claim's card is drawn for — the space a debate would be published into, and
  // the space its sides are read from.
  //
  // One row per claim, against the space `tagDisplaySpaceId` picks for it. Nothing is collapsed,
  // because nothing was ever duplicated: a claim arrives once carrying every space it is tagged in.
  const taggedRowsNow = React.useMemo(
    () =>
      taggedClaimsSettling
        ? []
        : taggedCatalog.flatMap(claim => {
            if (excludedClaimIds.has(claim.entity.id)) return [];
            const spaceId = tagDisplaySpaceId(
              claim,
              spaceIds,
              candidate => canPublishDebateIn(candidate) && isClaimSpaceAllowed(candidate, spaceAllowlist)
            );
            if (!spaceId) return [];
            const row = rowFromEntity(claim.entity, spaceId);
            // Both gates again, against the space the row actually carries: `rowFromEntity` takes
            // geo-chat's session row whole where it has one, and that row names its own space.
            if (!row || !canPublishDebateIn(row.claim.space_id)) return [];
            return isClaimSpaceAllowed(row.claim.space_id, spaceAllowlist) ? [row] : [];
          }),
    [canPublishDebateIn, excludedClaimIds, rowFromEntity, spaceAllowlist, spaceIds, taggedCatalog, taggedClaimsSettling]
  );

  // Keyed on the tag as well as the session.
  //
  // The hold exists so a refetch doesn't blank the list, and it can only do that honestly while the
  // list is *the same list*. Featured and All are two catalogs behind one variable, so without the
  // tag in the key, switching source shows the previous source's rows until the new tag lands — and
  // lands instantly once both are cached, which is why it looked like the first few clicks did
  // nothing at all. The filters join it for the same reason: a search is a different list.
  const taggedClaims = useLastSettled(
    taggedRowsNow,
    taggedClaimsSettling,
    `${sessionId}:${claimsTagId}:${debouncedSearch}:${spaceIds.join(',')}:${topicIds.join(',')}`
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
        : // Featured and All are the same list asked of two tags. Nothing is merged into either
          // any more (GEO-2798): the Claims tab is the graph's answer, and the session's own rows
          // live on the opponent's tab and under Recommended, where they always also were.
          taggedClaims;

  // Whether the list on screen was narrowed by its own query. Only the tagged sources are.
  const graphFiltered = tab === 'claims' && (source === 'featured' || source === 'all');

  // Both menus come from the server's own count over the tag, each narrowed by every dimension but
  // its own (GEO-2796). Counting from the rows could only ever describe the page in hand, which is
  // the thing paging makes wrong.
  //
  // Filtered by publishability on the way out: the server was sent the viewer's allowlist, but not
  // which spaces can carry a published debate — that is derived from the claims themselves.
  //
  // Only for the tagged sources. The opponent's tab and Recommended are lists fetched by id, and
  // they are deliberately *not* narrowed by the viewer's allowlist — a debater's own claims live in
  // their personal space, which nobody else has joined. Their spaces have to be in the menu with
  // them or the rows are visible and unfilterable, so those two count from the rows on screen.
  const facetSpaces = React.useMemo(() => {
    const offered = graphFiltered
      ? taggedSpaceFacet.spaces
          .filter(space => canPublishDebateIn(space.id) && isClaimSpaceAllowed(space.id, spaceAllowlist))
          .map(space => ({ id: space.id, name: null, count: space.count }))
      : countBy(claims.map(claim => ({ id: claim.claim.space_id, name: null })));
    // An absent *selection* comes back at zero, or its checkbox disappears while the trigger goes on
    // counting it, and it cannot be unticked without clearing every space.
    return orderFacetOptions(keepSelectedVisible(offered, spaceIds), spaceIds);
  }, [canPublishDebateIn, claims, graphFiltered, spaceAllowlist, spaceIds, taggedSpaceFacet.spaces]);

  // A space picked while the gates were still passing everything has to be let go once they reject
  // it, or it keeps narrowing every request while every row it returns is dropped.
  //
  // Let go on the *gates*, not on the menu. `keepSelectedVisible` puts a picked space back on the
  // menu at zero — deliberately, so it can be un-picked rather than vanishing under the cursor —
  // so a rule that pruned to what the menu offers could never drop the one thing it is for. Held
  // while the gates are still resolving: until they land they pass everything, so a space cleared
  // against them would be cleared on nothing.
  React.useEffect(() => {
    if (allowlistPending) return;
    setSpaceIds(current => {
      const kept = current.filter(id => canPublishDebateIn(id) && isClaimSpaceAllowed(id, spaceAllowlist));
      return kept.length === current.length ? current : kept;
    });
  }, [allowlistPending, canPublishDebateIn, spaceAllowlist]);

  // Same split: the tag's menu is the server's count, and the other two are counted from their own
  // rows — co-occurrence over the claims that already carry every picked topic, so the menu offers
  // what appears alongside the selection and nothing on it can lead to an empty list.
  const facetTopics = React.useMemo(() => {
    if (graphFiltered) return orderFacetOptions(taggedTopicFacet.topics, topicIds);
    const source = countBy(
      claims
        .filter(claim => carriesPickedTopics(claim.claim.claim_entity_id))
        .flatMap(claim =>
          (topicsByClaimId.get(claim.claim.claim_entity_id) ?? []).map(topic => ({ id: topic.id, name: topic.name }))
        )
    );
    return orderFacetOptions(source, topicIds);
  }, [carriesPickedTopics, claims, graphFiltered, taggedTopicFacet.topics, topicIds, topicsByClaimId]);

  // Only the tagged sources are narrowed by their query. The opponent's tab and Recommended are
  // both lists fetched by id — the opponent's positions, a curator's page — so nothing narrowed
  // them on the way in and the filters still run here.
  const visibleClaims = React.useMemo(() => {
    if (graphFiltered) return claims;
    return claims.filter(claim => {
      if (spaceIds.length > 0 && !spaceIds.includes(claim.claim.space_id)) return false;
      if (!carriesPickedTopics(claim.claim.claim_entity_id)) return false;
      if (debouncedSearch && !claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase())) return false;
      return true;
    });
  }, [carriesPickedTopics, claims, debouncedSearch, graphFiltered, spaceIds]);

  const hasFilters = Boolean(debouncedSearch || spaceIds.length || topicIds.length);

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: taggedHasNextPage,
    isFetchingNextPage: taggedFetchingNextPage,
    fetchNextPage: fetchNextTaggedPage,
  });

  // Each tab draws from a different set of queries, so each waits on its own. The allowlist narrows
  // the All tab alone now, so only that one waits for it.
  const tabIsLoading =
    sessionQuery.isLoading ||
    (tab === 'opponent'
      ? positions.isLoading || opponentEntitiesQuery.isLoading || opponentClaimsQuery.isLoading
      : sourceUndecided ||
        (source === 'recommended' ? recommendedLoading || curatedClaimsQuery.isLoading : taggedClaimsSettling));

  const tabError =
    sessionQuery.error ??
    (tab === 'opponent'
      ? (positions.error ?? opponentEntitiesQuery.error)
      : source === 'featured' || source === 'all'
        ? // The page is the list, and it carries everything a row is built from — so its failure is
          // the only one that leaves nothing to show. geo-chat's row lookup is metadata beside it:
          // losing it costs the faces and the readiness, not the claims, and blanking the tab for
          // that trades a short list for no list.
          taggedCatalogError
        : curatedClaimsQuery.error);

  // A topic the menu no longer offers is unpickable as well as empty — the chip filtering the
  // list would not be in the menu to clear. Unlike the Claims tab, the topics here arrive with
  // the claim rows rather than in a lookup behind them, so once the tab has settled an empty
  // menu is a real answer.
  React.useEffect(() => {
    // No source has a facet behind it any more, so every tab's own loading state is the whole
    // answer — the All tab used to wait on the index's facets as well.
    // `topicsSettling` for the same reason as on the hub: `facetTopics` is rebuilt from
    // `topicIds`, so reconciling while the selection is still debounced would re-run the effect on
    // its own output against one unchanged answer, and take the whole selection instead of the
    // single pick that didn't fit.
    // Not while the tab is in error either. react-query drops `isLoading` on failure, so an outage
    // looks exactly like a settled answer from here — and the answer it settles on is an empty
    // menu, because the entities the topics come from never arrived. Reconciling against that
    // reads "these topics no longer exist" and takes the viewer's selection with it, permanently:
    // the error clears, the rows come back, and the chips do not.
    //
    // Not covered by a test, deliberately rather than by omission. Five attempts at one here all
    // passed with this guard removed — the picker's four topic sources make "the menu is empty
    // *and* the tab is in error" hard to reach through the mocks. The hub's equivalent
    // (`facetsSettled` in claims-tab) is the same rule against one source, and it is pinned; this
    // is that rule, and it can only ever delay a prune, never cause a wrong one.
    //
    // And on a graph-filtered source, not before the *facet* has answered either. `tabIsLoading`
    // watches the catalog, which is a different query: switching back to a source whose page is
    // already cached settles it instantly while the facet is still out, and the menu it hands over
    // in that gap is empty for the same reason an outage's is. Same rule as the two above, applied
    // to the one source whose menu does not come from its own rows.
    const resolved = !topicsSettling && !tabIsLoading && !tabError && (!graphFiltered || taggedTopicFacet.settled);
    setTopicIds(current => keepSelectableTopics(current, facetTopics, resolved));
  }, [facetTopics, graphFiltered, tabError, tabIsLoading, taggedTopicFacet.settled, topicsSettling]);

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
    for (const claim of [...opponentClaims, ...curatedClaims, ...taggedClaims]) ids.add(claim.claim.space_id);
    for (const participant of participants) ids.add(participant.profile_space_id);
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [curatedClaims, taggedClaims, opponentClaims, participants]);
  useDebateGatewaySpaceScopes(scopedSpaceIds, geoChatAuthenticated && scopedSpaceIds.length > 0);

  // Readiness is reported by the card. geo-chat now carries it on the rematch claims
  // response itself; the per-space debate-claims endpoint is the fallback for a backend that
  // predates that, and it costs one query per space on screen.
  const { byClaimId: readinessByClaimId } = useClaimReadinessByClaimId({
    claims,
    unresolved:
      tab === 'opponent'
        ? opponentClaimsQuery.isLoading || Boolean(opponentClaimsQuery.error)
        : source === 'featured' || source === 'all'
          ? taggedClaimsQuery.isLoading || Boolean(taggedClaimsQuery.error)
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
      chatPosition={chatPositionByClaimId.get(claim.claim.claim_entity_id)}
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
              // Only the browsed source waits on geo-chat. The other two build their facets from
              // entities already in hand, so their counts are never behind the *selection*, and a
              // skeleton there would be describing a wait that isn't happening.
              //
              // Search is not like that: every source filters its rows by `debouncedSearch`, so
              // while the box is unsettled the counts describe the pre-typing query wherever they
              // came from. That window is ungated for the same reason the others are gated.
              // Not only the search since GEO-2798. That was true while the menus were built from
              // claims already in hand — a tick was answered on the same render, with no request
              // behind it. The tagged sources' menus are their own server requests now, and
              // `keepPreviousData` deliberately holds the previous filter's numbers rather than
              // blinking, so without this they read as current for a debounce plus a request.
              countsPending={
                searchSettling ||
                (graphFiltered && (topicsSettling || !taggedTopicFacet.settled || !taggedSpaceFacet.settled))
              }
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

        {/* The Claims tab pages again (GEO-2798), so the sentinel is back — for the tagged sources
            only. Recommended is a curator's page and the opponent's tab is their whole list; both
            still arrive complete. */}
        {taggedHasNextPage && !showsSections && tab === 'claims' ? (
          <div ref={sentinelRef} data-testid="rematch-claims-scroll-sentinel" className="h-px" />
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
 * Readiness for every claim on screen, keyed by claim entity id, so the shared card reads real
 * state. The Debate toggle it used to drive is gone (GEO-2740) — readiness now follows from
 * holding a position — but the card still reports readiness, so this stays.
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
  chatPosition,
  readiness: claimReadiness,
  onRequest,
  busy,
}: {
  claim: DebateRematchClaim;
  session: DebateRematchSession | null;
  currentUserId: string | null;
  /** geo-chat's own copy of this viewer's position; `undefined` when it has no row yet. */
  chatPosition: boolean | null | undefined;
  readiness: ClaimReadinessState | null;
  /** True while any readiness lookup is still running or has failed. */
  onRequest: () => void;
  busy: boolean;
}) {
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
  const responseIndexing = useEntityResponseIndexingSnapshot({
    entityId: claim.claim.claim_entity_id,
    spaceId: claim.claim.space_id,
    responseKind,
  });
  /**
   * The side the viewer holds, as well as it can be known: their in-flight answer where there is
   * one, and otherwise **geo-chat's** record.
   *
   * Deliberately not the graph, which this used to fall back to. That fallback caused two things.
   * It made the old readiness check compare a value against itself (the request was pressable and
   * geo-chat rejected it), and it made the control flicker: the optimistic answer clears when the
   * mutation settles, the graph is still ten seconds behind, so `opposing` collapsed and took the
   * whole footer with it — ready, then gone, then ready again.
   *
   * Falling back to `chatPosition` is not the same trap. There the fallback was a different source
   * from the one that validates the request; here they are the same source, so agreement is real.
   */
  /**
   * One snapshot, read at the card's threshold rather than the response hook's.
   *
   * `optimisticResponse` is derived from this same snapshot, so the two can never disagree about
   * *what* the answer is — but they disagree about when it is over. It goes undefined outside
   * `reconciling`/`delayed`, while the card counts anything but `idle` as still in flight. So at
   * `indexed` the pill stays lit and this fell straight through to geo-chat, which had not echoed
   * the write yet: `opposing` collapsed and unmounted the whole footer under a pill that was still
   * on. The button did not change label; it left.
   *
   * Matching the card's threshold is what keeps a card and its own footer describing one moment.
   */
  const inFlightResponse = optimisticResponse !== undefined ? optimisticResponse : responseIndexing.pending?.expectedResponse;

  const localPosition =
    inFlightResponse === undefined
      ? (chatPosition ?? null)
      : inFlightResponse === null
        ? null
        : inFlightResponse === 'positive';

  const opposing = localPosition !== null && remotePosition !== null && localPosition !== remotePosition;
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
  /**
   * The shared gate, so this reads the same fact the hub reads and wears the same label.
   *
   * `chatPosition` rather than the graph's view of the viewer's side, which is the whole fix: the
   * latter arrives via `participantSidesOn`, and comparing it against a `localPosition` that fell
   * back to it whenever there was no optimistic answer went trivially true and opened a button
   * geo-chat would still reject.
   *
   * `delayed` is only reachable from the response mutation's `onSuccess`, so by the time it is set
   * the publish has landed and the wait is the index. That changes the label, never the gate.
   */
  const requestGate = debateRequestGate({
    chatPosition,
    localPosition,
    opponentReady: opposing,
    indexingDelayed: responseIndexing.status === 'delayed',
  });
  /**
   * geo-chat's row agrees a moment before its request endpoint will honour that agreement, so the
   * offer is held for a beat after the gate opens. Reported from the browser: pressing the instant
   * it turned from "Publishing your position…" to "Request debate" returned
   * `claim_response_required`.
   *
   * The extra beat is spent in the pending state that was already on screen, so this reads as the
   * wait being marginally longer rather than as a new state — and it narrows the window rather than
   * closing it, which is why the failure below still has to be visible.
   */
  const gateHeld = useRequestGateGrace(requestGate.canRequest);
  const canRequest = requestGate.canRequest && gateHeld;
  const awaitingResponse = requestGate.pending || (requestGate.canRequest && !gateHeld);
  const awaitingLabel = requestGate.pendingLabel ?? REQUEST_PENDING_LABEL;
  const { openSidePanel } = useEntitySidePanel();
  const request = session?.request;

  const requesting =
    session?.status === 'request_pending' && request?.claim.claim_entity_id === claim.claim.claim_entity_id;

  const positions = React.useMemo(
    () => rematchPositionSummaries(claim, session, responseKind),
    [claim, responseKind, session]
  );

  // geo-chat's copy, deliberately — not the optimistic one. The card reads the viewer's own
  // in-flight response off the indexing snapshot for display, and uses this field for the two
  // questions only the server can answer: whether it is safe to send readiness yet, and whether the
  // position summaries already count the viewer. Handing it the optimistic answer claimed the
  // server agreed the instant the viewer clicked, which sent readiness before there was an indexed
  // response to hang it on and suppressed the optimistic avatar the card would otherwise add.
  //
  // `chatPosition`, not `claim.participants`. This used to read the latter, on the same reasoning —
  // except the assembly upstream overwrites those sides with the graph's, so "the server's copy"
  // had quietly become the indexer's. The card falls back to this field the moment the indexing
  // snapshot clears, so a graph that had not caught up yet took the viewer's own side off the card
  // and left it off for as long as `web.write.entity_response` took (p50 9.9s, p95 48.6s). It came
  // back only when the indexer landed, or when the viewer answered a second time (GEO-2808).
  const readiness: MatchmakingReadiness = {
    response_kind: responseKind,
    viewer_response:
      chatPosition === null || chatPosition === undefined
        ? null
        : { position: chatPosition, position_label: responsePositionLabel(responseKind, chatPosition) },
    viewer_debate_ready: claimReadiness?.viewer_debate_ready ?? false,
    readiness_disabled_reason: claimReadiness?.readiness_disabled_reason ?? null,
  };

  return (
    <MatchmakingClaimCard
      claim={claim.claim}
      positions={positions}
      readiness={readiness}
      // No end slot. A rematch request is its own mutation with its own gating, and the footer
      // below is the control that sends it, so a second "Request debate" in the header would be a
      // different button wearing the same words. Nothing to watch either: the picker has no
      // active-debate signal, and it is mid-session anyway — the only debate to watch is the one
      // the viewer is already in. With the slot off, `activeDebate` has no reader.
      hideEndSlot
      // `positions` locates the viewer by geo-chat user id, which is null until the token exchange
      // lands. Until then `chatPosition` reads as "no position" for someone the summaries
      // may already count, and the card would draw them onto a second side.
      viewerIdentityPending={currentUserId === null}
      // Reading a claim shouldn't cost the session: navigating to its entity page would leave the
      // rematch behind, so open it beside the picker instead.
      onOpenClaim={() => openSidePanel(claim.claim.claim_entity_id, claim.claim.space_id, false)}
      footer={
        // `recently_rejected` too: the note lives in this footer, and it is a standing fact about
        // the claim rather than a state of the offer. Without it a rejected claim the viewer has no
        // position on lost the explanation along with the button.
        awaitingResponse || canRequest || requesting || claim.recently_rejected ? (
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

/**
 * One row per claim, keeping the first that survived the gates.
 *
 * The tagged rows arrive one per tag, so a claim tagged in several spaces gets a chance in each —
 * which is the point, since only some of them may be publishable or shown to this viewer. Once the
 * gates have run, the list wants the claim once.
 */

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
