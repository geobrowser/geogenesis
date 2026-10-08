'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as React from 'react';

import cx from 'classnames';
import { motion } from 'framer-motion';
import { useAtom } from 'jotai';
import { useRouter } from 'next/navigation';

import { capture } from '~/core/analytics';
import { ANALYTICS_BUILD_ID } from '~/core/analytics-opportunities';
import { resolveClaimResponseKind } from '~/core/claims/browse/use-claim-response-state';
import { useAnsweredClaimEntities } from '~/core/debates/answered-claim-entities';
import {
  type DebateClaimPositionSummary,
  type DebateRematchClaim,
  type DebateRematchClaimPosition,
  type DebateRematchParticipant,
  type DebateRematchSession,
  type MatchmakingReadiness,
} from '~/core/debates/api';
import { type ClaimPickerEntity, useClaimEntitiesByIds } from '~/core/debates/claim-picker-page';
import { isClaimSpaceAllowed } from '~/core/debates/claim-space-allowlist';
import { markEnteringDebate } from '~/core/debates/debate-entry-intent';
import { useDebateGatewaySpaceScopes } from '~/core/debates/debate-gateway';
import { debatePublishableSpacePredicate } from '~/core/debates/debate-publish-target';
import { DebateRequestDialog } from '~/core/debates/debate-request-dialog';
import { consumeDebateReturnDestination } from '~/core/debates/debate-return-navigation';
import { DebateOpenElsewhereScreen } from '~/core/debates/debate-room-holding-screens';
import { claimDebateEntry, debateRoomClaimKey } from '~/core/debates/debate-tab-claims';
import { requestOpenRounds } from '~/core/debates/format-details';
import { defaultDebateFormatId } from '~/core/debates/formats';
import {
  type FromThisDebateClaim,
  fromThisDebateCandidates,
  useFromThisDebateList,
} from '~/core/debates/from-this-debate';
import {
  useAcceptDebateRematchRequest,
  useCreateDebateRematchRequest,
  useDebate,
  useDebateClaimsBySpaces,
  useDebateExtractedClaims,
  useDebateRematch,
  useDebateRematchClaims,
  useDebateRematchClaimsForIds,
  useGeoChatAuth,
  useLeaveDebateRematch,
  useNotInterestedClaimIds,
  useRejectDebateRematchRequest,
} from '~/core/debates/hooks';
import { claimRowKey } from '~/core/debates/matchmaking/claim-row-key';
import { SpaceTopicFilters } from '~/core/debates/matchmaking/claims-tab';
import { type AnsweredState, useCollapseAnswered } from '~/core/debates/matchmaking/collapse-answered';
import { debateActionAnalyticsAttributes } from '~/core/debates/matchmaking/hub-analytics';
import { HubFilterMenu, type HubFilterOption } from '~/core/debates/matchmaking/hub-filter-menu';
import { HubCardList, hubCardMotion } from '~/core/debates/matchmaking/hub-motion';
import { HubPillButton } from '~/core/debates/matchmaking/hub-pill-button';
import { HubQueryState, HubSkeleton } from '~/core/debates/matchmaking/hub-states';
import { HideAgreedSwitch, HideMyPositionsSwitch } from '~/core/debates/matchmaking/matches-only-switch';
import { MatchmakingClaimCard } from '~/core/debates/matchmaking/matchmaking-claim-card';
import { ScrollableTabRow } from '~/core/debates/matchmaking/scrollable-tab-row';
import {
  carriesEveryTopic,
  claimTopicsById,
  countBy,
  keepSelectableTopics,
  orderFacetOptions,
  toggleId,
  topicsFor,
} from '~/core/debates/matchmaking/topic-facets';
import { useDebouncedSearch } from '~/core/debates/matchmaking/use-debounced-search';
import { useDebouncedSelection } from '~/core/debates/matchmaking/use-debounced-selection';
import { useSpaceFilterMenu } from '~/core/debates/matchmaking/use-space-filter-selection';
import { useStableListOrder } from '~/core/debates/matchmaking/use-stable-list-order';
import { DEBATE_TAG_ID } from '~/core/debates/ontology';
import {
  type ParticipantPositionsByClaim,
  participantSidesOn,
  useParticipantPositions,
} from '~/core/debates/participant-positions';
import { useRecommendedClaimSections } from '~/core/debates/recommended-claims';
import { useRegisterRematchPanelContext } from '~/core/debates/rematch-panel-context';
import { RematchRequestControl } from '~/core/debates/rematch-request-control';
import { useDebateRoomContext, useInDebateRoom, useRoomOpponentPresent } from '~/core/debates/rooms/room-context';
import { DebateRoomPresenceIndicator } from '~/core/debates/rooms/room-presence-indicator';
import {
  type TaggedClaimFilters,
  tagDisplaySpaceId,
  useTaggedAnsweredCount,
  useTaggedClaims,
  useTaggedSpaceFacet,
  useTaggedTopicFacet,
} from '~/core/debates/tagged-claims';
import { useClaimSpaceAllowlist } from '~/core/debates/use-claim-space-allowlist';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { isSpaceDebatePublishable, useDebatePublishableSpaces } from '~/core/debates/use-debate-publishable-spaces';
import { useLeaveRematchOnExit } from '~/core/debates/use-leave-rematch-on-exit';
import { useRelatedDebateClaims } from '~/core/debates/use-related-debate-claims';
import { useEffectOnceWhen } from '~/core/hooks/use-effect-once';
import { useEntitySidePanel } from '~/core/hooks/use-entity-side-panel';
import { useEntityResponse, useEntityResponseIndexingSnapshot } from '~/core/hooks/use-entity-vote';
import { useInfiniteScrollSentinel } from '~/core/hooks/use-infinite-scroll-sentinel';
import { useLastSettled } from '~/core/hooks/use-last-settled';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { equals as idEquals, uuidToHex } from '~/core/id/normalize';
import { responsePositionLabel } from '~/core/responses/entity-response';
import { normId } from '~/core/utils/norm-id';
import { getTopRankedSpaceId } from '~/core/utils/space/space-ranking';
import { NavUtils, validateSpaceId } from '~/core/utils/utils';
import { validateEntityId } from '~/core/utils/utils';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';
import { tabGroupTabLinkStyles } from '~/design-system/tab-group';
import { Text } from '~/design-system/text';

import { RematchRequestCard } from './rematch-request-card';
import { RematchVoiceHeader } from './rematch-voice';
import { rematchHideAgreedAtom, rematchHideMyPositionsAtom } from '~/atoms';

const NO_PARTICIPANTS: DebateRematchParticipant[] = [];
const NO_CLAIMS: DebateRematchClaim[] = [];

/**
 * `explore` was renamed from `claims` with GEO-2861, to match the hub's own browse tab. `related`
 * joined with GEO-2758: claims sharing a topic with the one this pair just argued.
 *
 * Related is a tab rather than another Explore source because of where it sits in the question being
 * asked. Explore's sources are four answers to "which claims?" — a catalogue the viewer browses.
 * Related is not a way of browsing; it is the continuation of the debate that just happened, which is
 * why it is also where the pair land.
 *
 * `debate` is GEO-2870 phase 2, "From this debate": the claims extracted from the debate that just
 * finished, read from geo-chat's fast path (GEO-2868 option C) rather than waiting ~27 minutes for
 * the graph. Offered whenever the session came out of a debate, including while extraction is still
 * running, because the list filling in is the point.
 *
 * `matches` is GEO-3148: the claims the two of you hold opposite sides on and have not debated, so
 * every one of them can be requested from its card. It replaced the "Matches only" switch that used
 * to narrow the opponent's tab — a setting most people never touched and the rest flipped back and
 * forth — and it is where the pair land whenever it has anything in it. `opponent` is "Their
 * positions" on screen and `positions` is "My positions"; the ids predate the labels.
 */
type PickerTab = 'matches' | 'related' | 'debate' | 'explore' | 'positions' | 'opponent';

/** A tab's answer to "is there anything here to land on", once its lookups have said. */
type LandingState = 'pending' | 'filled' | 'empty';

/** A list's landing state: unknown while its lookups are out, then whether it has any rows. */
function listLandingState(pending: boolean, rows: number): LandingState {
  return pending ? 'pending' : rows > 0 ? 'filled' : 'empty';
}

/**
 * GEO-3148. Where a pair land: the first of these tabs with something in it, and Explore — which
 * always has something — when none does.
 *
 * Matches first, because a claim the two of you can debate right now is what the page is for. Then
 * the debate that just finished, then its neighbours, then everything the opponent has taken a side
 * on, where a match is one press away.
 *
 * `null` while an earlier tab has not answered. Landing on a later one in that window would be
 * landing on a guess, and the landing is taken once: a tab whose answer arrives afterwards must not
 * move someone who is already reading a list.
 */
export function resolveLandingTab(states: ReadonlyArray<readonly [PickerTab, LandingState]>): PickerTab | null {
  for (const [tab, state] of states) {
    if (state === 'pending') return null;
    if (state === 'filled') return tab;
  }
  return 'explore';
}

/** What `feature_exposed` reports the landing as, so the analytics name the tabs as people see them. */
const LANDING_TAB_ANALYTICS_NAMES: Record<PickerTab, string> = {
  matches: 'matches',
  debate: 'from_this_debate',
  related: 'related',
  opponent: 'their_positions',
  positions: 'my_positions',
  explore: 'explore',
};

/**
 * One row per picker session saying where it landed and what each earlier tab held at the time
 * (GEO-3148). `feature_exposed` because it is already registered end to end: a new event name is
 * dropped by the runtime and the collector until both learn it.
 */
function captureLandingTab(properties: {
  rematchSessionId: string;
  tab: PickerTab;
  choseFirst: boolean;
  matches: number;
  debateClaims: number;
  related: number;
  theirPositions: number;
}) {
  try {
    const instance = crypto.randomUUID();
    capture('feature_exposed', {
      feature_id: 'debate-rematch-landing-tab',
      feature_version: 'geo-3148-v1',
      build_id: ANALYTICS_BUILD_ID,
      exposure_id: instance,
      presentation_instance_id: instance,
      measurement_version: 'growth-v2',
      rematch_session_id: properties.rematchSessionId,
      landing_tab: LANDING_TAB_ANALYTICS_NAMES[properties.tab],
      // The viewer picked a tab before the landing was decided, so they never saw it.
      chose_before_landing: properties.choseFirst,
      matches_count: properties.matches,
      from_this_debate_count: properties.debateClaims,
      related_count: properties.related,
      their_positions_count: properties.theirPositions,
    });
  } catch {
    /* Optional telemetry. */
  }
}
/**
 * GEO-2683. Where Explore draws its list from. Recommended, All claims, Featured and the viewer's
 * own positions are four answers to one question — "which claims?" — so they belong in a menu
 * rather than in four tabs the viewer has to notice appearing and disappearing.
 */
type ClaimsSource = 'recommended' | 'all' | 'mine';

/**
 * What Explore's menu can still offer.
 *
 * `mine` left it for a tab of its own, the way GEO-2863 promoted the hub's, and Featured left with
 * it — a curated cut of the same tag behind a menu most viewers never opened, which is the reason
 * the hub gives for dropping it there. What remains is the curator's page for this pairing, where
 * one exists, and everything else; the menu draws itself only when both are on offer.
 */
type ExploreSource = Exclude<ClaimsSource, 'mine'>;

const CLAIMS_SOURCE_LABELS: Record<ExploreSource, string> = {
  recommended: 'Recommended',
  all: 'All claims',
};

/** Stable identity so the hydration below doesn't restart whenever Featured isn't the source. */

/**
 * The claims one participant has taken a side on, newest response first — the order the graph
 * returns them in, which the grouping keeps.
 *
 * Both the opponent's tab and Explore's "My positions" are this question asked about one of the two
 * debaters, and `positions` already covers both, so neither costs a lookup of its own.
 */
function claimIdsAnsweredBy(byClaim: ParticipantPositionsByClaim, profileSpaceId: string | null): string[] {
  if (!profileSpaceId) return [];

  const ids: string[] = [];
  for (const [claimId, rows] of byClaim) {
    if (rows.some(row => idEquals(row.profileSpaceId, profileSpaceId))) ids.push(claimId);
  }

  return ids;
}

/** Each rejoin already retries its request; these space out whole attempts when all of those fail. */
const ROOM_REJOIN_ATTEMPTS = 3;
const ROOM_REJOIN_RETRY_MS = 15_000;

export function DebateRematchPageClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  // The room owns this session rather than the other way round, so two of the page's exits change
  // shape inside one: see the terminal-status effect and `leave` below.
  const inDebateRoom = useInDebateRoom();
  const roomPresence = useDebateRoomContext()?.presence ?? null;
  const roomRejoin = useDebateRoomContext()?.rejoin;
  const rejoinedForRef = React.useRef<string | null>(null);
  const rejoinFailuresRef = React.useRef({ sessionId: '', count: 0 });
  // Bumped to run the effect again after a failed rejoin, since the ended session itself will not change.
  const [rejoinRetry, setRejoinRetry] = React.useState(0);
  const { authenticated: geoChatAuthenticated } = useGeoChatAuth();
  const currentUserId = useCurrentGeoChatUserId();
  /**
   * The viewer's geo-chat id is still coming.
   *
   * `useCurrentGeoChatUserId` answers from the stored session synchronously, and exchanges a token
   * for it when there is none — a fresh tab, cleared storage, the first visit after signing in. In
   * that window neither participant can be picked out of the session, so every list keyed on one of
   * them comes back empty for a reason that has nothing to do with what anybody holds. The lists
   * wait it out rather than reporting it: "they haven't responded yet" and a badge reading `0` are
   * both specific claims, and on the tab the picker opens on they are the first thing a returning
   * pair reads.
   *
   * Gated on being signed in, not merely on the id being absent. Signed out it never arrives, and a
   * list that waited on it would wait for the whole visit.
   */
  const viewerIdentityUnresolved = geoChatAuthenticated && currentUserId === null;
  const exitStartedRef = React.useRef(false);
  const leaveRequestedRef = React.useRef(false);
  const sessionQuery = useDebateRematch(sessionId);
  const [search, setSearch] = React.useState('');
  const { value: debouncedSearch, pending: searchSettling } = useDebouncedSearch(search);

  const [spaceIds, setSpaceIds] = React.useState<string[]>([]);
  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  /**
   * The tab the viewer picked, and the session they picked it on.
   *
   * Left unset until they pick, so the landing tab below stays a derivation rather than a value
   * fixed before the lookups it depends on have settled.
   *
   * Kept with its session for the same reason the warm-up below is: the route reuses this component
   * when it moves between rematches, and this is the one piece of state that is *about the pair*.
   * A viewer who opened Explore with one opponent arrived at the next one still on Explore — past
   * the tab that exists to say what that person has already taken a side on, which is the whole
   * reason the picker opens there.
   */
  const [chosenTab, setChosenTab] = React.useState<{ sessionId: string; tab: PickerTab } | null>(null);
  /**
   * Where this session landed (GEO-3148), latched once — see `resolveLandingTab`. Kept with its
   * session for the same reason as `chosenTab`: the next pair are landed afresh.
   */
  const [landing, setLanding] = React.useState<{ sessionId: string; tab: PickerTab } | null>(null);
  const [hideMyPositions, setHideMyPositions] = useAtom(rematchHideMyPositionsAtom);
  const [hideAgreed, setHideAgreed] = useAtom(rematchHideAgreedAtom);
  // Left unset until the viewer picks one: Recommended is the best default when a curator has put
  // something together for this pairing, and it doesn't exist otherwise. Deciding in state would
  // fix the default before that lookup settles.
  const [chosenSource, setChosenSource] = React.useState<ExploreSource | null>(null);

  // A choice is about the pair it was made with: the next opponent is landed afresh (GEO-3148).
  const setTab = React.useCallback((next: PickerTab) => setChosenTab({ sessionId, tab: next }), [sessionId]);

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
  /** For the buttons and the line that name them (GEO-3148): "See Jenna’s positions" fits a pill. */
  const remoteFirstName = remoteName.trim().split(/\s+/)[0] || remoteName;

  // The claims the opponent has taken a side on, newest response first — the graph returns them in
  // that order, and the grouping keeps it.
  const opponentClaimIds = React.useMemo(
    () => claimIdsAnsweredBy(positions.byClaim, remoteParticipant?.profile_space_id ?? null),
    [positions.byClaim, remoteParticipant]
  );

  // Those ids are all the graph hands back; the claim itself — name, description, home space,
  // whether it is factual, topics — is a second, narrow lookup. Asked for by *person* rather than by
  // those ids (GEO-2656), so it runs alongside positions instead of waiting for them: the badge
  // used to sit behind positions and then this, one after the other.
  const opponentEntitiesQuery = useAnsweredClaimEntities(remoteParticipant?.profile_space_id ?? null, opponentClaimIds);

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
  const {
    allowlist: spaceAllowlist,
    memberSpaceIds,
    isLoading: allowlistLoading,
    isSettlingMemberships,
  } = useClaimSpaceAllowlist();

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
  // `isLoading` is read, not discarded. This lookup answers `null` for *unknown* — a load in
  // flight and a failed one alike — and `isSpaceDebatePublishable` reads null as "don't filter", so
  // during the load the menu offers spaces it will go on to reject. Only the seed cares about the
  // difference: everything else is happy to fail open, but a default taken from a provisional menu
  // is spent on a space the reconciliation then removes, leaving the viewer with no default at all.
  // After an error `isLoading` is false and the ids stay null, so fail-open is preserved.
  const { publishableSpaceIds, isLoading: publishableSpacesLoading } = useDebatePublishableSpaces();

  /* -----------------------------------------------------------------------------------------------
   * GEO-2758. Related claims: the tab the pair land on straight out of a debate.
   *
   * Discovery lives in `useRelatedDebateClaims` rather than here, because the debate room runs the
   * same hook while the debate is still going. The chain from a claim to a list of neighbours is
   * three serial requests, and run from here it is a second of tab strip arriving after the page
   * did — the thing that made the tab flash into place. Run from the room, the answer is already in
   * the cache by the time the pair get here.
   * ---------------------------------------------------------------------------------------------*/

  const related = useRelatedDebateClaims({ claim: sourceDebateQuery.data?.claim });
  const relatedSourceSpaceId = related.spaceId;
  const relatedClaimIds = related.claimIds;

  const relatedEntitiesByIdQuery = useClaimEntitiesByIds(relatedClaimIds);
  const relatedClaimsQuery = useDebateRematchClaimsForIds(sessionId, relatedClaimIds);

  /**
   * Turning discovery's ids into rows, as opposed to finding them. Named once so the tab's error
   * state and the decision to keep the tab at all cannot disagree about which failures are which.
   */
  const relatedRowsError = relatedEntitiesByIdQuery.error ?? relatedClaimsQuery.error ?? null;

  /* -----------------------------------------------------------------------------------------------
   * GEO-2870 phase 2. "From this debate": the claims geo-chat extracted from the debate this session
   * came out of, read from its fast path. Polled while the payload can still change; listed
   * append-only (D4) so a claim never moves under someone reading it.
   *
   * Each claim's id is geo-chat's graph match, or the stable id it minted (D1) — the id the publisher
   * creates the claim under. A matched claim is already in the graph and requestable now. A minted
   * one is not until it is published: geo-chat resolves every request against the graph and refuses
   * an id it cannot find (`claim_not_found`), and a position on it would be a vote on an entity that
   * does not exist yet. Option A publishes minted claims a minute or two after extraction rather
   * than with the debate (`/api/debates/publish-claims-sweep`). The graph lookup below is what
   * splits the two, and an unpublished claim is drawn without the controls rather than with
   * controls that fail.
   * ---------------------------------------------------------------------------------------------*/
  const sourceDebateId = session?.source_debate_id ?? null;
  const extractedClaimsQuery = useDebateExtractedClaims(sourceDebateId ?? '', sourceDebateId !== null);
  const notInterested = useNotInterestedClaimIds(sourceDebateId !== null);
  const notInterestedIds = React.useMemo(() => new Set(notInterested.ids.map(normId)), [notInterested.ids]);
  const debateCandidates = React.useMemo(
    () => (extractedClaimsQuery.data ? fromThisDebateCandidates(extractedClaimsQuery.data.payload) : null),
    [extractedClaimsQuery.data]
  );
  // A claim somebody has a request open on stays listed even if the final pass drops it (D4).
  const openRequestClaimId =
    session?.status === 'request_pending' && session.request ? normId(session.request.claim.claim_entity_id) : null;
  const openRequestClaimIds = React.useMemo(
    () => new Set(openRequestClaimId ? [openRequestClaimId] : []),
    [openRequestClaimId]
  );
  const debateList = useFromThisDebateList(debateCandidates, openRequestClaimIds, sessionId);
  const debateClaimIds = React.useMemo(() => debateList.map(claim => claim.id), [debateList]);
  // Polled while any is missing: the early claims publish puts them on the graph a minute or two
  // after geo-chat extracts them (GEO-2870 option A), and each card gains its controls in place.
  const debateEntitiesQuery = useClaimEntitiesByIds(debateClaimIds, { pollMissingMs: DEBATE_CLAIM_PUBLISH_POLL_MS });
  const debateEntitiesById = React.useMemo(
    () => new Map(debateEntitiesQuery.entities.map(entity => [normId(entity.id), entity])),
    [debateEntitiesQuery.entities]
  );
  // Only ids the graph knows go to geo-chat's row lookup, which resolves every id it is handed
  // against the graph — an unpublished one would cost the batch it rides in.
  const publishedDebateClaimIds = React.useMemo(
    () => debateClaimIds.filter(claimId => debateEntitiesById.has(claimId)),
    [debateClaimIds, debateEntitiesById]
  );
  const debateRowsQuery = useDebateRematchClaimsForIds(sessionId, publishedDebateClaimIds);
  /** Extraction can still add claims: the media job has not reached its last write. */
  const debateExtractionRunning = sourceDebateId !== null && extractedClaimsQuery.data?.final !== true;

  // The whole chain, enumerated once, so the gates below cannot each wait on a different subset of
  // it — the mistake that let one gate pass while another was still waiting. The source debate is
  // this page's own hop; the rest belongs to the hook.
  const relatedDiscoveryError = sourceDebateQuery.error ?? related.error ?? null;
  const relatedDiscoveryPending = sourceDebateQuery.isLoading || related.isLoading;

  /**
   * Whether discovery is still working, which is the first half of whether the tab is offered. A
   * failure decides it as surely as an answer does, so nothing still in flight is waited on past
   * that point.
   *
   * Nothing to discover reads as decided, without asking the session whether it came out of a
   * debate: a session from a profile challenge disables the source-debate query, and no claim
   * disables the two behind it, so there is nothing in flight to be undecided about. The gate on
   * `source_debate_id` this used to carry was the same question asked twice.
   *
   * The session lookup itself counts, though, and leaving it out reintroduced the flicker one step
   * earlier: until it lands there is no `source_debate_id` to disable anything *with*, so discovery
   * is idle for a reason that says nothing, the strip drew without Related, and the tab appeared and
   * moved the pair the moment the session arrived. Usually already warm — the room holds this same
   * session while the debate runs — so this is a window that mostly does not happen.
   */
  const relatedPending = sessionQuery.isLoading || (relatedDiscoveryError === null && relatedDiscoveryPending);

  /**
   * A tab the viewer picked, where it is this session's.
   *
   * Read here rather than at the landing decision below, because two queries are gated on Explore
   * being open and the resolved tab is not available yet — it waits on the Related rows, which wait
   * on those queries. The choice and the latched landing are both state, so asking them instead
   * cannot loop: Explore is reached by picking it or by landing there, and nothing else.
   */
  const chosenForSession = chosenTab?.sessionId === sessionId ? chosenTab.tab : null;
  const landedForSession = landing?.sessionId === sessionId ? landing.tab : null;

  /** Whether the viewer is in the browse tab — chosen, or landed on with nothing else to show. */
  const browsing = (chosenForSession ?? landedForSession) === 'explore';

  /** Likewise for their own positions, which is now a tab rather than a source inside that one. */
  const viewingPositions = chosenForSession === 'positions';

  // GEO-2683. Fetched only when Featured is the source on screen — it is one option in a menu, and
  // the other two answer for themselves.
  //
  // Narrowed by the viewer's allowlist, unlike Recommended. Recommended is one page from a space
  // this build trusts by id; Featured is a tag anyone's space can carry, so it fans out across the
  // corpus the way All claims does and is bounded the same way.
  const hasRecommended = recommendedSections.length > 0;
  /**
   * All claims, always — the option that leads the menu, and the hub's default, so Explore means the
   * same thing on both surfaces from the first render as well as in the order it offers.
   *
   * Recommended is offered *first* where a curator has made a page for this pair, and is not what
   * the tab opens on. It used to be, and that cost more than it was worth: the landing source could
   * not be decided until the curated lookup settled — "no curator page" and "not yet" being one
   * answer until it lands — so every viewer waited on a lookup most of them would find nothing in,
   * before the list they were going to see could even start. Leading the menu says the same thing
   * about a curator's work without holding the tab up to say it.
   *
   * And a Recommended *choice* does not outlive the pairing it was made for. The route reuses this
   * component between rematches, and a curator's page is assembled for one pair — so a viewer who
   * picked Recommended with one opponent arrived at the next one on a source that pairing has no
   * page for: the trigger read "Recommended", the menu no longer offered it, and the list under it
   * said nothing was recommended. The other three sources are cuts of the corpus and mean the same
   * thing whoever you are facing, so only this one is let go.
   *
   * Derived rather than written back, so the choice survives: returning to the pairing that *does*
   * have a page opens on it again, which is what the viewer asked for when they picked it.
   *
   * Only once the lookup has settled, because that same ambiguity applies to letting go of it:
   * coercing while it is in flight would drop the viewer off Recommended and put them back a moment
   * later.
   */
  const chosenRecommendedIsGone = chosenSource === 'recommended' && !recommendedLoading && !hasRecommended;
  // The tab answers first: Positions is its own now, so the menu below only ever chooses between
  // the curator's page and everything else.
  const source: ClaimsSource = viewingPositions ? 'mine' : chosenRecommendedIsGone ? 'all' : (chosenSource ?? 'all');

  /**
   * "Positions": the viewer's own side of the lookup the opponent's tab reads.
   *
   * `positions` already covers both debaters, so the ids are free. The entities behind them and
   * geo-chat's rows for those used to wait until the tab was opened — a lookup for a list nobody
   * had asked for. The tab carries a count now, and a count has to be of the rows the tab will
   * actually list: `participantClaimRows` drops claims this session has already ruled out and
   * claims in spaces that cannot carry a published debate, so a number taken from `positions`
   * alone would sit above the list it describes. That is the same confident-and-wrong badge
   * GEO-2656 took out of the opponent's tab, so the lookup runs with the opponent's instead.
   */
  const viewerClaimIds = React.useMemo(
    () => claimIdsAnsweredBy(positions.byClaim, localParticipant?.profile_space_id ?? null),
    [localParticipant, positions.byClaim]
  );
  // By person, alongside positions, for the same reason as the opponent's.
  const viewerEntitiesQuery = useAnsweredClaimEntities(localParticipant?.profile_space_id ?? null, viewerClaimIds);
  // Both graph-sourced options, one pipeline (GEO-2771).
  //
  // Featured and All are the same question asked of two tags — which claims carry it — so All joins
  // the machinery Featured already had rather than paging geo-chat's whole corpus for a list of 312.
  // Recommended is the exception: it is the curator's own page, not a tag.
  //
  // Gated on the tab too: a remembered source shouldn't keep a graph query alive behind the
  // opponent's positions, which draw from somewhere else entirely.
  //
  // Once, before that gate applies. GEO-2861 moved the landing tab to the opponent's positions,
  // which left Explore's whole chain to start from cold on the click that opens it — a paged
  // catalog and two facets, and then geo-chat's rows keyed on the ids the catalog comes back with,
  // which cannot start until it has. On the old landing tab all of that ran while the page was
  // still painting; behind a click it is a wait with a viewer watching it.
  //
  // So the browse source is fetched once while the viewer is on the tab they landed on, and from
  // then on the tab decides as before — the rule this weakens is "don't keep a query alive behind
  // the opponent's positions", and one warm-up is not keeping anything alive.
  //
  // It costs the same whichever tag is showing, which is why it can carry All claims as the landing
  // source: the catalog is one page of fifty however large the tag is, and both facets are narrowed
  // by the viewer's eligible spaces before they count anything. What a viewer who never opens
  // Explore pays for is a page and two counts, not a corpus.
  //
  // The effect that ends it is below `taggedClaimsQuery`, which is the last hop it waits for.
  const claimsTagId = DEBATE_TAG_ID;
  // Kept with the session it was spent on, the way `useCurrentGeoChatUserId` keeps its id with the
  // account. The route reuses this component when it moves between rematches — `useLastSettled`
  // takes `sessionId` as its reset key for the same reason — so a bare boolean would say "already
  // warm" for a session whose rows had never been asked for, and the second rematch of a sitting
  // would open Explore cold. The rows lookup is keyed on the session; the warm-up has to be too.
  const [warmedSessionId, setWarmedSessionId] = React.useState<string | null>(null);
  const browseWarmed = warmedSessionId === sessionId;
  const taggedEnabled = (browsing || !browseWarmed) && source === 'all';
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

  // "Hide my positions" goes out with the query (GEO-2894): the server leaves out the claims the
  // viewer already holds a position on, so a page is fifty rows that can be shown and the facets
  // count the same set. Keyed on the stored preference rather than on the tab, because the catalogue
  // is warmed from the opponent's tab and has to be the list Explore will read.
  //
  // Held until the viewer's own participant row is known, or the first page would be the unfiltered
  // one and the answered claims would be drawn and taken back.
  const excludeAnsweredBy = hideMyPositions ? (localParticipant?.profile_space_id ?? null) : null;
  const excludePending =
    hideMyPositions && localParticipant === null && (sessionQuery.isLoading || viewerIdentityUnresolved);

  const taggedFilters = React.useMemo<TaggedClaimFilters>(
    () => ({ search: debouncedSearch, topicIds: debouncedTopicIds, spaceIds, eligibleSpaceIds, excludeAnsweredBy }),
    [debouncedSearch, debouncedTopicIds, eligibleSpaceIds, excludeAnsweredBy, spaceIds]
  );
  /** What the tagged query waits on before it can be asked the right question. */
  const taggedScopePending = allowlistPending || excludePending;

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
  } = useTaggedClaims(claimsTagId, taggedFilters, taggedEnabled && !taggedScopePending);

  const taggedTopicFacet = useTaggedTopicFacet(claimsTagId, taggedFilters, taggedEnabled && !taggedScopePending);
  const taggedSpaceFacet = useTaggedSpaceFacet(claimsTagId, taggedFilters, taggedEnabled && !taggedScopePending);

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
  const viewerClaimsQuery = useDebateRematchClaimsForIds(sessionId, viewerClaimIds);
  const curatedClaimsQuery = useDebateRematchClaimsForIds(sessionId, recommendedClaimIds);
  const taggedClaimsQuery = useDebateRematchClaimsForIds(sessionId, taggedClaimIds);

  // The warm-up is over when every query behind the tab has answered, whatever it answered.
  //
  // `taggedClaimsQuery` included, and that is the whole reason this sits down here rather than
  // beside the catalog. It is keyed on ids the catalog produces, so it has not started when the
  // catalog lands — and marking the warm-up done at that moment turns the tag source off on the
  // opponent's tab, which masks the catalog, empties `taggedClaimIds` and disables this query
  // before it ever runs. The click on Explore would then still wait for the last hop, which is the
  // one the warm-up exists to hide.
  //
  // `isLoading` rather than the facets' `settled`, so a failure ends the warm-up too: react-query
  // drops `isLoading` on error, where `settled` stays false and would leave these enabled for the
  // whole session.
  //
  // Spent once per session and never unspent within it: a viewer who has opened Explore has the
  // cache this exists to fill, and one who has not is on a tab that reads none of it.
  //
  // What it warms is the *unfiltered* key, and for a viewer with member spaces on the menu that is
  // not the key Explore settles on: the membership default lands on arrival and re-keys the catalog
  // and the topic facet once more. That second request is deliberate and predates this — see
  // `offeredSpaces` below, where the seed is drawn from the menu rather than from the eligible set
  // precisely so it cannot tick a space the tag has nothing in. The seeded key is therefore
  // unknowable until the unfiltered one has been fetched: the menu comes from the facet *and* the
  // publishability gate, and that gate is built from the catalog's own rows.
  //
  // So the warm-up cannot remove that wave, and is not trying to. What it removes is the first one:
  // the click lands on rows rather than on a skeleton, and `keepPreviousData` holds them while the
  // narrowed page arrives, so the seed reads as a filter applying rather than as a reload.
  React.useEffect(() => {
    if (browseWarmed || !taggedEnabled || taggedScopePending) return;
    if (taggedCatalogLoading || taggedTopicFacet.isLoading || taggedSpaceFacet.isLoading) return;
    if (taggedClaimsQuery.isLoading) return;
    setWarmedSessionId(sessionId);
  }, [
    browseWarmed,
    sessionId,
    taggedCatalogLoading,
    taggedClaimsQuery.isLoading,
    taggedEnabled,
    taggedScopePending,
    taggedSpaceFacet.isLoading,
    taggedTopicFacet.isLoading,
  ]);

  // A claim's sides, from the graph. The shape the rest of the page was already drawing.
  const sidesOf = React.useCallback(
    (claimId: string, claimSpaceId: string): DebateRematchClaimPosition[] =>
      participantSidesOn(positions.byClaim, claimId, claimSpaceId, participants).map(side => ({
        user_id: side.participant.user_id,
        position: side.position,
        position_label: side.position === null ? null : responsePositionLabel(side.position),
      })),
    [participants, positions.byClaim]
  );

  /**
   * Every geo-chat rematch-claim lookup on this page, in one list.
   *
   * Three aggregates below are built from "all of them", and each used to spell that out for
   * itself. Adding a sixth source meant remembering three places, and the Related tab arrived
   * missing from all three: its rows lost `recently_rejected`, `previously_debated`, shared
   * preference and readiness, and the claims this session excludes were not excluded from it.
   * Enumerated once so a seventh source cannot be half-wired the same way.
   */
  const rematchClaimLookups = React.useMemo(
    () => [
      savedClaimsQuery.data,
      opponentClaimsQuery.data,
      viewerClaimsQuery.data,
      curatedClaimsQuery.data,
      taggedClaimsQuery.data,
      relatedClaimsQuery.data,
      debateRowsQuery.data,
    ],
    [
      savedClaimsQuery.data,
      opponentClaimsQuery.data,
      viewerClaimsQuery.data,
      curatedClaimsQuery.data,
      taggedClaimsQuery.data,
      relatedClaimsQuery.data,
      debateRowsQuery.data,
    ]
  );

  /**
   * Keyed canonically, and read through {@link isClaimExcluded}.
   *
   * These ids come from geo-chat, which spells them as UUIDs; every caller tests them against a
   * graph entity id, which is bare hex. A raw `has` across that boundary is always false, so the
   * exclusions geo-chat sends were never applied to any graph-sourced list — the claim the pair
   * just debated included, which this set adds by hand for exactly that reason.
   */
  const excludedClaimIds = React.useMemo(() => {
    const excluded = new Set(
      rematchClaimLookups.flatMap(data => (data?.excluded_claim_ids ?? []).map(claimId => normId(claimId)))
    );
    const sourceClaimId = sourceDebateQuery.data?.claim.claim_entity_id;
    if (sourceClaimId) excluded.add(normId(sourceClaimId));
    return excluded;
  }, [rematchClaimLookups, sourceDebateQuery.data]);

  /** Whether this session excludes a claim, whichever spelling of its id the caller holds. */
  const isClaimExcluded = React.useCallback(
    (claimEntityId: string) => excludedClaimIds.has(normId(claimEntityId)),
    [excludedClaimIds]
  );

  // A claim either side recently rejected stays listed with its request disabled, as geo-chat's
  // own rows flag it; the hub's index knows nothing of this session, so its rows read the list.
  const recentlyRejectedClaimIds = React.useMemo(
    // Canonical for the same reason as the exclusions above: geo-chat's spelling, read against a
    // graph entity id.
    () => new Set((session?.recently_rejected_claim_ids ?? []).map(claimId => normId(claimId))),
    [session?.recently_rejected_claim_ids]
  );

  // Whether geo-chat's rows carry readiness at all. When they do, a claim its settled batch has no
  // row for has no readiness row either: not ready is the truth, not a guess to send per space.
  // A backend that predates readiness on these rows leaves every claim to the per-space lookup.
  const sessionCarriesReadiness = React.useMemo(() => {
    const rows = rematchClaimLookups.flatMap(data => data?.claims ?? []);
    return rows.length === 0 || rows[0]!.viewer_debate_ready !== undefined;
  }, [rematchClaimLookups]);

  // geo-chat's row for a claim, where it has one. It carries the session flags and readiness; the
  // sides on it are replaced by the graph's below, which is what the card draws.
  //
  // That replacement used to be justified as the graph being "fresher by a notification round
  // trip". It is not, and has not been since #2348: geo-chat learns a position the moment the write
  // starts, while the graph waits on `web.write.entity_response` (p50 9.9s). The sides are still
  // drawn from the graph — that is the shape the page draws, and both agree in the end — but the
  // *gate* is measured against geo-chat below, because geo-chat is what rejects an early request.
  /**
   * Keyed canonically, and read through {@link sessionRowFor}.
   *
   * The keys are geo-chat's `claim_entity_id` and every lookup is a graph entity id, so a raw `get`
   * across that boundary answers "no row" for a claim geo-chat does have one for — and "no row" is
   * not visible as a failure. It reads as a claim with no session history: no recently-rejected
   * flag, no previously-debated flag, no shared preference, and readiness defaulting to false,
   * which disables the request button and says nothing about why.
   */
  const sessionRowsByClaimId = React.useMemo(
    () =>
      new Map(
        rematchClaimLookups
          .flatMap(data => data?.claims ?? [])
          .map(claim => [normId(claim.claim.claim_entity_id), claim] as const)
      ),
    [rematchClaimLookups]
  );

  /** geo-chat's row for a claim, whichever spelling of its id the caller holds. */
  const sessionRowFor = React.useCallback(
    (claimEntityId: string) => sessionRowsByClaimId.get(normId(claimEntityId)),
    [sessionRowsByClaimId]
  );

  /**
   * The claims geo-chat says this pair have already debated together (GEO-3120), from every lookup
   * on the page, keyed canonically. Read through `isPairDebated` below.
   */
  const pairDebatedClaimIds = React.useMemo(
    () =>
      new Set(
        rematchClaimLookups
          .flatMap(data => data?.claims ?? [])
          .filter(claim => claim.previously_debated)
          .map(claim => normId(claim.claim.claim_entity_id))
      ),
    [rematchClaimLookups]
  );

  /**
   * geo-chat's own copy of the viewer's position, per claim, kept out of the assembly below so it
   * survives being overwritten by the graph's sides (GEO-2808).
   *
   * Present-but-no-entry is recorded as `null`: geo-chat has a row and holds no position for this
   * viewer, which is an answer. A claim with no row at all reads as `undefined` — not an answer.
   * `debateRequestGate` blocks on both and only distinguishes them so a missing row cannot read as
   * a deliberate absence.
   *
   * Carries the row's space, and the reader matches on it. Responses are space-scoped, and the
   * assembly below already discards a row recorded in a space other than the one a card is being
   * drawn under — so keying this on the claim alone fed that discarded row's position into the
   * card's gate anyway, and could open a request geo-chat scopes elsewhere and rejects.
   */
  const chatPositionByClaimId = React.useMemo(() => {
    const byClaim = new Map<string, { spaceId: string; position: boolean | null }>();
    // Every source is a rematch row since #2351 moved paging server-side. This used to also read
    // `viewer_response` off the hub's paged index, which that change removed.
    for (const row of sessionRowsByClaimId.values()) {
      // `viewer_position` in preference to the viewer's `participants` entry. The latter carries
      // only what a live knowledge-graph resolution returned, and that resolve sits behind a
      // timeout on geo-chat's side — when it lapses every `participants` position comes back null,
      // which this gate reads as "no position held" and uses to disable every Request button on
      // the page, for everyone, saying nothing. `viewer_position` falls back to the readiness row
      // geo-chat already holds, so a slow graph costs accuracy at the margin instead of the
      // whole page.
      //
      // Checked against `undefined` rather than with `??`, because `null` is a real answer here —
      // geo-chat has a row and the viewer holds no position — and only `undefined` means a backend
      // that predates the field. Collapsing the two would make an old backend look like a
      // deliberate absence.
      const viewerParticipant = row.participants.find(side => side.user_id === currentUserId);
      // Canonical, as every id-keyed structure on this page is: these keys are geo-chat's and the
      // reader below is handed whichever spelling the row it is drawing carries.
      byClaim.set(normId(row.claim.claim_entity_id), {
        spaceId: row.claim.space_id,
        position: row.viewer_position !== undefined ? row.viewer_position : (viewerParticipant?.position ?? null),
      });
    }
    return byClaim;
  }, [currentUserId, sessionRowsByClaimId]);

  /** geo-chat's position for this claim *in this space*, or `undefined` when it has no such row. */
  const chatPositionFor = React.useCallback(
    (claimEntityId: string, spaceId: string): boolean | null | undefined => {
      const recorded = chatPositionByClaimId.get(normId(claimEntityId));
      if (!recorded || !idEquals(recorded.spaceId, spaceId)) return undefined;
      return recorded.position;
    },
    [chatPositionByClaimId]
  );

  // A debate is published into the claim's home space by the acceptor, and a personal space grants
  // editor rights to its owner alone — so a claim living in one can never carry a published debate
  // (see `isDebatePublishableSpace`). Every list is narrowed by this, unlike the viewer-specific
  // allowlist above: it is a property of the claim, so both debaters see the same answer, and
  // offering such a claim spends a debate on a result that quietly evaporates.
  //
  // Every space a claim is named in is looked up, not just the one that currently wins the ranking,
  // because which one wins is the next decision and it needs the types to make it.
  //
  // Plus every space the tagged facet offers, which is not the same set and stopped being a subset
  // when GEO-2798 paged the tag. The rows are one page; the facet counts the whole tag — so a space
  // whose only tagged claim is on a later page reaches the *menu* without ever reaching this
  // lookup, and an unresolved type reads as publishable. The menu would then offer a personal
  // space, which is the one thing this gate exists to exclude, and the one-shot default would be
  // spent on it and pruned once its page finally arrived. Asking about the ids the menu is built
  // from is what makes "settled" mean settled; the tag spans a handful of spaces, so it is cheap.
  /**
   * Every claim entity any list on this page draws from, in one place.
   *
   * Both aggregates below are "all of them", and both used to spell it out separately — so the
   * Related tab arrived in neither. That cost more than a missing label: an entity absent from the
   * space lookup never has its space *type* resolved, and an unresolved type deliberately reads as
   * publishable, so a personal space reachable only through Related would have passed the one gate
   * that exists to exclude it.
   */
  const catalogEntities = React.useMemo(
    () => [
      ...opponentEntitiesQuery.entities,
      ...viewerEntitiesQuery.entities,
      ...recommendedEntities,
      ...relatedEntitiesByIdQuery.entities,
      ...debateEntitiesQuery.entities,
      ...taggedCatalog.map(claim => claim.entity),
    ],
    [
      opponentEntitiesQuery.entities,
      viewerEntitiesQuery.entities,
      recommendedEntities,
      relatedEntitiesByIdQuery.entities,
      debateEntitiesQuery.entities,
      taggedCatalog,
    ]
  );

  const candidateSpaceIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const entity of catalogEntities) {
      for (const spaceId of claimCandidateSpaceIds(entity)) ids.add(spaceId);
    }
    for (const space of taggedSpaceFacet.spaces) ids.add(space.id);
    return [...ids];
  }, [catalogEntities, taggedSpaceFacet.spaces]);
  const {
    spacesById: candidateSpaces,
    isLoading: candidateSpacesPending,
    isPlaceholderData: candidateSpacesHeldOver,
  } = useSpacesByIds(candidateSpaceIds);
  const spaceTypePublishable = React.useMemo(() => debatePublishableSpacePredicate(candidateSpaces), [candidateSpaces]);
  /**
   * Whether {@link canPublishDebateIn} can be trusted yet.
   *
   * An unresolved type reads as publishable — deliberately, so a slow lookup doesn't empty the
   * picker — so while this is true the predicate admits spaces it will go on to reject, a personal
   * space among them. Held-over counts: `useSpacesByIds` answers from the previous id set rather
   * than blanking, and it knows nothing about an id it was never asked for.
   *
   * Named here rather than at the reader, because this is the lookup that decides it. The picker
   * has a second `useSpacesByIds` for the allowlist, whose pending state `scope.pending` carries;
   * they are different questions about different ids and neither covers the other.
   */
  const publishabilityPending = candidateSpacesPending || candidateSpacesHeldOver;
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
      const recordedRow = sessionRowFor(entity.id);
      const sessionRow =
        preferred && recordedRow && !idEquals(recordedRow.claim.space_id, preferred) ? undefined : recordedRow;
      const responseKind = resolveClaimResponseKind();
      return {
        /**
         * Left in whichever spelling its source used, deliberately.
         *
         * A row geo-chat supplied carries its hyphenated UUIDs; one built from the entity carries
         * the graph's bare hex. Canonicalizing here would give the page one spelling — and would
         * also change what goes back *out*: this object is the payload for the debate request, the
         * side panel and the readiness lookup, and geo-chat would stop receiving the ids it handed
         * over. So the normalization lives at each join instead, on both sides, where it cannot
         * change anything but the matching.
         */
        claim: sessionRow?.claim ?? {
          id: entity.id,
          space_id: homeSpaceId,
          claim_entity_id: entity.id,
          claim: entity.name,
          description: entity.description,
        },
        response_kind: responseKind,
        participants: sidesOf(entity.id, sessionRow?.claim.space_id ?? homeSpaceId),
        shared_preference: sessionRow?.shared_preference ?? false,
        recently_rejected: sessionRow?.recently_rejected ?? recentlyRejectedClaimIds.has(normId(entity.id)),
        previously_debated: sessionRow?.previously_debated ?? false,
        // These rows only list once their geo-chat batch has settled (see `sessionCarriesReadiness`).
        viewer_debate_ready: sessionRow ? sessionRow.viewer_debate_ready : sessionCarriesReadiness ? false : undefined,
        readiness_disabled_reason: sessionRow ? sessionRow.readiness_disabled_reason : null,
      };
    },
    [canPublishDebateIn, recentlyRejectedClaimIds, sessionCarriesReadiness, sessionRowFor, sidesOf]
  );

  // Topics live on the KG claim entity, so resolve them here to label each card and drive the
  // "Any topic" filter. A claim can carry several topics.
  //
  // Every row's, from graph entities alone. geo-chat sends its rows back with `topics: []`, so
  // folding those in never added anything — the topics have to come from the entity or not at all,
  // which is why the saved claims are hydrated above rather than trusted to carry their own, and
  // why reading that empty array the other way round emptied the list in GEO-2714.
  const topicsByClaimId = React.useMemo(() => claimTopicsById(catalogEntities), [catalogEntities]);

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
    // Scoped to the space the card is drawn under: topics are assigned per space, so a topic the
    // claim carries somewhere else is not one it carries here.
    (claimEntityId: string, spaceId: string) =>
      carriesEveryTopic(topicsFor(topicsByClaimId, claimEntityId, spaceId), topicIds),
    [topicIds, topicsByClaimId]
  );

  /**
   * Whether the pair have debated this claim against each other before, on any day (GEO-3120).
   *
   * geo-chat's `previously_debated` is the only source: true exactly when these two people have a
   * finished debate on the claim together. It arrives on the same rows each list already waits
   * for, so there is nothing extra to hold a list on. A backend that predates it sends `false`
   * everywhere, and every list reads as it did before.
   *
   * Read off every lookup by claim id as well as off the row itself, because the flag is about the
   * pair and the claim, not the space: `rowFromEntity` drops a session row recorded in a space
   * other than the one a card is drawn under, and the flag would go with it.
   */
  const isPairDebated = React.useCallback(
    (claim: DebateRematchClaim) =>
      claim.previously_debated || pairDebatedClaimIds.has(normId(claim.claim.claim_entity_id)),
    [pairDebatedClaimIds]
  );

  // The opponent's tab: every claim they hold a side on, newest first. Held until the session's
  // exclusions are in, so nothing lists and then vanishes. Not narrowed by the space allowlist —
  // see it above.
  /**
   * One participant's positions as picker rows, shared-preference first.
   *
   * The opponent's tab and Explore's "My positions" are the same list asked about two people, so
   * they are the same code asked about two people: `holdsSide` is the whole of the difference.
   *
   * It tests the *row's* sides rather than trusting the ids, and that is not belt-and-braces. The
   * ids come from the graph, so the claim is certainly answered — but a response recorded in a
   * space other than the one the card is drawn under is dropped by `participantSidesOn`, and such a
   * row would list here with nobody's position on it.
   */
  const participantClaimRows = React.useCallback(
    (claimIds: string[], entities: ClaimPickerEntity[], holdsSide: (userId: string) => boolean) => {
      const entitiesById = new Map(entities.map(entity => [entity.id, entity]));
      const rows: DebateRematchClaim[] = [];
      for (const claimId of claimIds) {
        if (isClaimExcluded(claimId)) continue;
        const entity = entitiesById.get(claimId);
        const row = entity ? rowFromEntity(entity) : null;
        if (row && row.participants.some(side => holdsSide(side.user_id) && side.position !== null)) rows.push(row);
      }
      return rows
        .filter(row => canPublishDebateIn(row.claim.space_id))
        .sort((a, b) => Number(b.shared_preference) - Number(a.shared_preference));
    },
    [canPublishDebateIn, isClaimExcluded, rowFromEntity]
  );

  const opponentClaimsSettling =
    viewerIdentityUnresolved || opponentClaimsQuery.isLoading || opponentEntitiesQuery.isLoading;
  const opponentClaimsNow = React.useMemo(
    () =>
      opponentClaimsSettling
        ? []
        : participantClaimRows(opponentClaimIds, opponentEntitiesQuery.entities, userId => userId !== currentUserId),
    [currentUserId, opponentClaimIds, opponentClaimsSettling, opponentEntitiesQuery.entities, participantClaimRows]
  );
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
  const opponentClaimsListed = useStableListOrder(opponentClaimsHeld, claimRowKey, sessionId);
  const opponentClaimsSplit = React.useMemo(
    () => splitByDebated(opponentClaimsListed, isPairDebated),
    [opponentClaimsListed, isPairDebated]
  );
  const opponentClaims = opponentClaimsSplit.fresh;

  // My positions: the same list asked about the viewer. Not narrowed by the space allowlist either,
  // and for the same reason — a debater's own claims live in their personal space, which nobody
  // else has joined.
  //
  // `positions.isLoading` is part of the settling state rather than only the two lookups below it.
  // Those are keyed on ids that come *from* positions, so while positions is in flight the id list
  // is empty, they are disabled rather than loading, and nothing here would report as pending.
  const viewerClaimsSettling =
    viewerIdentityUnresolved || positions.isLoading || viewerEntitiesQuery.isLoading || viewerClaimsQuery.isLoading;
  const viewerClaimsNow = React.useMemo(
    () =>
      viewerClaimsSettling
        ? []
        : participantClaimRows(viewerClaimIds, viewerEntitiesQuery.entities, userId => userId === currentUserId),
    [currentUserId, participantClaimRows, viewerClaimIds, viewerClaimsSettling, viewerEntitiesQuery.entities]
  );
  const viewerClaimsHeld = useLastSettled(viewerClaimsNow, viewerClaimsSettling, sessionId);
  // Held against the viewer's own acting on it, exactly as the opponent's list is: taking a side
  // flips `shared_preference`, and re-sorting would send the row they just acted on to the top and
  // carry the rest of the list with it.
  const viewerClaimsListed = useStableListOrder(viewerClaimsHeld, claimRowKey, sessionId);
  const viewerClaimsSplit = React.useMemo(
    () => splitByDebated(viewerClaimsListed, isPairDebated),
    [viewerClaimsListed, isPairDebated]
  );
  const viewerClaims = viewerClaimsSplit.fresh;

  // The curated tab, in the curator's order. Held the same way, and likewise not narrowed by the
  // space allowlist.
  const curatedClaimsSettling = curatedClaimsQuery.isLoading;
  const curatedClaimsNow = React.useMemo(
    () =>
      curatedClaimsSettling
        ? []
        : recommendedClaimIds.flatMap(claimId => {
            if (isClaimExcluded(claimId)) return [];
            const entity = recommendedEntities.find(candidate => candidate.id === claimId);
            const row = entity ? rowFromEntity(entity) : null;
            return row && canPublishDebateIn(row.claim.space_id) ? [row] : [];
          }),
    [
      canPublishDebateIn,
      curatedClaimsSettling,
      isClaimExcluded,
      recommendedClaimIds,
      recommendedEntities,
      rowFromEntity,
    ]
  );
  const curatedClaimsListed = useLastSettled(curatedClaimsNow, curatedClaimsSettling, sessionId);
  const curatedClaimsSplit = React.useMemo(
    () => splitByDebated(curatedClaimsListed, isPairDebated),
    [curatedClaimsListed, isPairDebated]
  );
  const curatedClaims = curatedClaimsSplit.fresh;

  /**
   * The Related tab's rows, built exactly as the curated list is: the same projection, the same
   * session flags, the same two gates. Only the ids differ.
   *
   * Held while its lookups settle so a refetch does not blank a list that is still right.
   *
   * Only once discovery has found something to draw. The row waits below are about *these* rows, and
   * `publishabilityPending` is not even this tab's own lookup — it covers every catalog source — so
   * ungated it let another tab's space lookup hold this one's slot open on a session that had no
   * related claims at all, which is a phantom tab arrived at from the other end. `relatedPending`
   * stays unconditional: it is discovery itself, and its whole job is the window before there are
   * ids to count.
   *
   * `publishabilityPending` is here and on none of the other lists, which is a deliberate asymmetry
   * rather than an oversight. An unresolved space type reads as publishable — fail-open, so a slow
   * lookup does not empty a list — and every other tab accepts that, because a viewer reaches those
   * by choosing them and a row that proves unpublishable simply goes. This is the tab the pair are
   * *dropped* onto: they are looking at it before they chose anything, so the window where a row is
   * drawn actionable and turns out to be in a personal space is a window where a debate can be
   * requested that could never be published. Related is also the tab most likely to open that
   * window, since it can be the only source naming the debated claim's space.
   *
   * It costs a held slot rather than a blank one — the reservation below already covers settling —
   * so the price is rows arriving with the space types instead of before them.
   */
  const relatedRowsPending =
    relatedClaimIds.length > 0 &&
    (publishabilityPending || relatedEntitiesByIdQuery.isLoading || relatedClaimsQuery.isLoading);
  const relatedClaimsSettling = sessionQuery.isLoading || relatedPending || relatedRowsPending;
  const relatedClaimsNow = React.useMemo(
    () =>
      relatedClaimsSettling
        ? []
        : relatedClaimIds.flatMap(claimId => {
            if (isClaimExcluded(claimId)) return [];
            const entity = relatedEntitiesByIdQuery.entities.find(candidate => idEquals(candidate.id, claimId));
            // The debated claim's own space, not the claim's ranking: the clause found this neighbour
            // on a topic and a tag assigned *there*, so drawing it anywhere else would offer it on
            // something that is not true where the debate would be published.
            //
            // A preference is all `rowFromEntity` takes, though — it falls back to the claim's own
            // ranking when the preferred space cannot carry a debate — and for this list a fallback
            // is not a lesser answer, it is a wrong one: the topic and tag predicates were satisfied
            // in the source space, and nothing was asked about any other. So the space is required
            // rather than preferred, and a row that came back drawn somewhere else is dropped.
            const row = entity ? rowFromEntity(entity, relatedSourceSpaceId ?? undefined) : null;
            if (!row || relatedSourceSpaceId === null) return [];
            return idEquals(row.claim.space_id, relatedSourceSpaceId) && canPublishDebateIn(row.claim.space_id)
              ? [row]
              : [];
          }),
    [
      canPublishDebateIn,
      isClaimExcluded,
      relatedClaimIds,
      relatedClaimsSettling,
      relatedEntitiesByIdQuery.entities,
      relatedSourceSpaceId,
      rowFromEntity,
    ]
  );
  const relatedClaimsListed = useLastSettled(relatedClaimsNow, relatedClaimsSettling, sessionId);
  const relatedClaimsSplit = React.useMemo(
    () => splitByDebated(relatedClaimsListed, isPairDebated),
    [relatedClaimsListed, isPairDebated]
  );
  const relatedClaims = relatedClaimsSplit.fresh;

  /**
   * GEO-2870 phase 2. The "From this debate" list, in the order geo-chat extracted it.
   *
   * A published claim is a picker row like any other — the same projection, session flags and
   * gates as Related, drawn in the debated claim's own space, since that is where the publisher puts
   * it. An unpublished one has no row, only its text and turn, and is drawn without controls.
   * Excluded and "Not interested" claims are left out of both.
   */
  const debateSpaceId = sourceDebateQuery.data?.claim.space_id ?? null;
  const debateItemsSettling =
    sessionQuery.isLoading ||
    sourceDebateQuery.isLoading ||
    extractedClaimsQuery.isLoading ||
    notInterested.isLoading ||
    (debateClaimIds.length > 0 &&
      (debateEntitiesQuery.isLoading || debateRowsQuery.isLoading || publishabilityPending));
  const debateItemsNow = React.useMemo<FromThisDebateItem[]>(
    () =>
      debateItemsSettling
        ? []
        : debateList.flatMap((claim): FromThisDebateItem[] => {
            if (isClaimExcluded(claim.id) || notInterestedIds.has(claim.id)) return [];
            const entity = debateEntitiesById.get(claim.id);
            if (!entity) return [{ claim, row: null }];
            if (debateSpaceId === null) return [];
            const row = rowFromEntity(entity, debateSpaceId);
            if (!row || !idEquals(row.claim.space_id, debateSpaceId) || !canPublishDebateIn(row.claim.space_id)) {
              return [];
            }
            return [{ claim, row }];
          }),
    [
      canPublishDebateIn,
      debateEntitiesById,
      debateItemsSettling,
      debateList,
      debateSpaceId,
      isClaimExcluded,
      notInterestedIds,
      rowFromEntity,
    ]
  );
  const debateItems = useLastSettled(debateItemsNow, debateItemsSettling, sessionId);
  const debateClaimsSplit = React.useMemo(
    () =>
      splitByDebated(
        debateItems.flatMap(item => (item.row ? [item.row] : [])),
        isPairDebated
      ),
    [debateItems, isPairDebated]
  );
  const debateClaims = debateClaimsSplit.fresh;
  const debateItemByClaimId = React.useMemo(
    () => new Map(debateItems.map(item => [item.claim.id, item.claim])),
    [debateItems]
  );
  /** Who said a claim, for its card: the turn's speaker, else that participant's own name. */
  const debateSpeakerOf = React.useCallback(
    (claim: FromThisDebateClaim) =>
      claim.speakerName ??
      participants.find(
        participant => claim.speakerSpaceId && idEquals(participant.profile_space_id, claim.speakerSpaceId)
      )?.display_name ??
      null,
    [participants]
  );
  /** Offered whenever there is a debate behind the session — empty while extraction runs is the point. */
  const debateOffered = sourceDebateId !== null;

  /**
   * Whether the tab is offered — and so, below, whether it is where the pair land.
   *
   * Read off the finished rows rather than off what discovery found, because between the two sit
   * two gates that can empty the list: the claims this session excludes, and the ones whose space
   * cannot carry a published debate. Counting discovery's answer meant a single neighbour that
   * `excluded_claim_ids` removes still read as "has neighbours", and the pair landed on a tab whose
   * list was empty — the state this tab is meant to avoid, arrived at by the tab itself.
   *
   * Offered while the rows are still settling, too, which is the one place it deliberately gets
   * ahead of what is known, and is the lesser of two flickers. Withholding it until the count landed
   * meant the strip rendered without Related and the pair started on the opponent's positions, then
   * a moment later the tab appeared and moved them — on every rematch out of a debate, which is the
   * common case. Holding the slot costs a tab that goes away when a debated claim turns out to have
   * nothing left to argue, which is the rare one. Both are a reflow; only one happens most of the
   * time. And cheap to hold, because the room has usually answered it already — see
   * `useRelatedDebateClaims`.
   *
   * A discovery failure reads as "no related claims" rather than surfacing an error, the same way a
   * failed curator lookup leaves Recommended out of the Explore menu: this tab is an enhancement on
   * top of a picker that works without it, so a lookup nobody asked for should not put an error in
   * front of someone who came here to choose a claim.
   *
   * Tested here rather than left to the row count, because a failure does not reliably produce an
   * empty one: `useQueryEntities` falls back to matching rows already in the local store when its
   * fetch fails, so a failed discovery can still hand back claims — and the pair would be landed on
   * a tab built from whatever the store happened to hold. Only *discovery* failures. An error from
   * the row lookups below is a tab that exists and could not draw, which `tabError` reports where
   * the rows would be.
   */
  /**
   * A row lookup that failed is a tab that exists and could not draw, which is what `tabError`
   * reports where the rows would be. Without this the tab went instead: the rows are empty and
   * nothing is settling, so a cold failure looked exactly like "no neighbours" and the error was
   * never shown to anyone. Discovery having found ids is what separates the two.
   */
  const relatedRowsFailed = relatedClaimIds.length > 0 && relatedRowsError !== null;
  const relatedOffered =
    relatedDiscoveryError === null && (relatedClaims.length > 0 || relatedClaimsSettling || relatedRowsFailed);

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
  const taggedClaimsSettling = taggedScopePending || taggedCatalogLoading || taggedClaimsQuery.isLoading;

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
            if (isClaimExcluded(claim.entity.id)) return [];
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
    [canPublishDebateIn, isClaimExcluded, rowFromEntity, spaceAllowlist, spaceIds, taggedCatalog, taggedClaimsSettling]
  );

  // Keyed on the tag as well as the session.
  //
  // The hold exists so a refetch doesn't blank the list, and it can only do that honestly while the
  // list is *the same list*. Featured and All are two catalogs behind one variable, so without the
  // tag in the key, switching source shows the previous source's rows until the new tag lands — and
  // lands instantly once both are cached, which is why it looked like the first few clicks did
  // nothing at all. The filters join it for the same reason: a search is a different list.
  /**
   * What the tagged queries are keyed by, as one value — so the hold below, which exists to bridge
   * a refetch of *the same* list, lets go when the list changes. The debounced topics rather than
   * the live ones, because that is what the query uses; spaces are not debounced on the way in, so
   * those are live.
   *
   * The eligible set is in it too, and it is the one nobody picks: it goes out with the query, so a
   * membership landing or a space ceasing to be publishable makes this a different corpus.
   *
   * Not the "Hide my positions" exclusion, though it goes out with the query as well. Pressing the
   * switch changes which rows show rather than which list this is, so the rows on screen are held
   * while the other answer arrives instead of being dropped for a skeleton.
   */
  const taggedListKey = `${sessionId}:${claimsTagId}:${debouncedSearch}:${spaceIds.join(',')}:${debouncedTopicIds.join(',')}:${eligibleSpaceIds === null ? 'any' : eligibleSpaceIds.join(',')}`;

  const taggedClaimsListed = useLastSettled(taggedRowsNow, taggedClaimsSettling, taggedListKey);
  const taggedClaimsSplit = React.useMemo(
    () => splitByDebated(taggedClaimsListed, isPairDebated),
    [taggedClaimsListed, isPairDebated]
  );
  const taggedClaims = taggedClaimsSplit.fresh;

  // The opponent is whichever participant isn't the local user; with no local user there is none.
  const opponentPositionOf = React.useCallback(
    (claim: DebateRematchClaim) =>
      currentUserId === null
        ? null
        : (claim.participants.find(position => position.user_id !== currentUserId)?.position ?? null),
    [currentUserId]
  );

  const viewerPositionOf = React.useCallback(
    (claim: DebateRematchClaim) =>
      currentUserId === null
        ? null
        : (claim.participants.find(position => position.user_id === currentUserId)?.position ?? null),
    [currentUserId]
  );

  /**
   * A match (GEO-2861, a tab of its own since GEO-3148): both of you hold a side, and they are
   * opposite ones — the claims a rematch can be requested on right now.
   *
   * A client-side predicate, unlike the hub's, because there is no matches endpoint here. Both sides
   * are already in hand from the session's own rows, so this asks the same question of them rather
   * than approximating it.
   */
  const isRematchable = React.useCallback(
    (claim: DebateRematchClaim) => {
      const mine = viewerPositionOf(claim);
      const theirs = opponentPositionOf(claim);

      return mine !== null && theirs !== null && mine !== theirs;
    },
    [opponentPositionOf, viewerPositionOf]
  );

  /**
   * Both of you hold the same side: nothing to debate. What "Hide agreed" takes off their tab.
   *
   * Asked of both records of the viewer's side, and agreement only when neither says otherwise. The
   * graph's (`viewerPositionOf`) carries this page's own in-flight answers; geo-chat's is what the
   * card's Request debate is gated on. A side switched somewhere else reaches geo-chat while the
   * graph is still behind, and hiding on the graph alone hid a claim whose button would be live.
   * Where the two disagree the claim stays — showing a dead row for a moment is the cheaper mistake.
   */
  const isAgreed = React.useCallback(
    (claim: DebateRematchClaim) => {
      const theirs = opponentPositionOf(claim);
      if (theirs === null || viewerPositionOf(claim) !== theirs) return false;
      const chat = chatPositionFor(claim.claim.claim_entity_id, claim.claim.space_id);

      return chat === undefined || chat === theirs;
    },
    [chatPositionFor, opponentPositionOf, viewerPositionOf]
  );

  /**
   * Their positions as the tab's badge, the landing and the filter menus count them. Not what the
   * list draws, which holds a claim agreed with *on* the tab rather than dropping it under the press
   * — see `visibleClaims`.
   */
  const opponentClaimsShown = React.useMemo(
    () => (hideAgreed ? opponentClaims.filter(claim => !isAgreed(claim)) : opponentClaims),
    [hideAgreed, isAgreed, opponentClaims]
  );

  /**
   * GEO-3148. The Matches tab: the opponent's positions that you hold the other side of, not yet
   * debated between you. Every one shows Request debate, which is why the cards need no badge.
   *
   * Drawn from the opponent's list rather than fetched, because a match *is* one of their positions,
   * so it waits on, holds through and fails with exactly what that list does.
   */
  const matchClaims = React.useMemo(() => opponentClaims.filter(isRematchable), [isRematchable, opponentClaims]);
  /**
   * Whether they have taken a side on anything at all — the debated ones included, which their tab
   * folds away rather than drops. What the Matches empty state says and offers turns on this, not on
   * `opponentClaims`, which is only the undebated half. The landing and the badge count that half on
   * purpose: they are about what is new.
   */
  const opponentHasPositions = opponentClaimsListed.length > 0;
  /** Matches already debated, which Matches leaves out and "Their positions" folds away. */
  const debatedMatchCount = React.useMemo(
    () => opponentClaimsSplit.debated.filter(isRematchable).length,
    [isRematchable, opponentClaimsSplit.debated]
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
    () => opponentClaimsShown.filter(claim => opponentPositionOf(claim) !== null).length,
    [opponentClaimsShown, opponentPositionOf]
  );

  /** The viewer's own, counted off the same list the tab draws — see `opponentPositionCount`. */
  const viewerPositionCount = React.useMemo(
    () => viewerClaims.filter(claim => viewerPositionOf(claim) !== null).length,
    [viewerClaims, viewerPositionOf]
  );

  /**
   * GEO-2656. The badge drew `0` from the very first paint, because the count is derived from a
   * list that is empty until the lookups behind it land.
   *
   * It is not a separate, faster count, and cannot be one: the tab leaves out claims the session
   * excludes, claims in spaces that cannot publish, and positions taken in a space other than the
   * claim's own, and no server-side count can say any of that. A one-hop count differed from the
   * list by up to 3 on testnet's busiest voters, which would show one number and then correct it.
   * So the number is still the list's length, and what got faster is the list: the claim entities
   * are asked for by person, alongside positions, rather than by the ids positions returns
   * (`useAnsweredClaimEntities`). What is left is positions and then the session's rematch rows.
   *
   * Zero is not a neutral placeholder here. It is a specific, confident claim — "this person holds
   * no positions" — and it is usually wrong, on the one tab whose whole purpose is their
   * positions. A viewer who reads it and switches away has been told something false.
   *
   * `positions.isLoading` has to be part of this. The rematch rows are keyed on ids that come
   * *from* positions, so while positions is still in flight the id list is empty, that query is
   * disabled rather than loading, and nothing downstream reports as pending.
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

  /**
   * The same rule for the same reason: `0` is a claim about the viewer's own backlog, and it is
   * wrong for as long as the chain behind it is still running.
   *
   * Not `publishabilityPending`, though it is tempting here — a debater's own responses often live
   * in their personal space, `canPublishDebateIn` fails open until the space types land, and the
   * number can therefore settle high and narrow as they resolve. It narrows because *the list
   * narrows*: fail-open is what keeps a slow lookup from emptying the tab, and this number is of
   * the rows the tab draws. Holding it back through that window would put a skeleton on the tab
   * over a list already showing rows, which is a worse thing to be told than a count that follows
   * what is under it. (Behind the `length === 0` guard the term did nothing either way: fail-open
   * means the provisional rows are already there, so the guard is false wherever it would matter.)
   */
  /**
   * The viewer's own two sources, as `opponentTabError` is the opponent's — and the same pair the
   * tab below draws its error state from, so the number and the list are answering one question.
   * Named up here because the badge is decided long before `tabError`, which is the composite.
   */
  const viewerTabError = sessionQuery.error ?? positions.error ?? viewerEntitiesQuery.error;
  const viewerCountPending =
    viewerClaims.length === 0 &&
    // The failure belongs with the loading flags rather than beside them: react-query drops
    // `isLoading` on failure, so an outage leaves every flag false over an empty list and reads
    // from here exactly like somebody who has answered nothing. Inside the `length === 0` guard,
    // so a held list keeps its number through a refetch that failed — those rows are still right.
    (sessionQuery.isLoading || positions.isLoading || viewerClaimsSettling || Boolean(viewerTabError));

  /**
   * "From this debate" counts what it lists: unpublished claims included, since they are rows on the
   * tab even without controls, and already-debated ones not, since the tab folds those away. The
   * list only ever grows while extraction runs (D4), so neither does the number drop.
   *
   * Held as a skeleton rather than a `0` while extraction is still running and nothing has arrived:
   * "none yet" is the true answer, and `0` reads as "none".
   */
  const debateClaimCount = React.useMemo(
    () => debateItems.filter(item => !item.row || !isPairDebated(item.row)).length,
    [debateItems, isPairDebated]
  );
  const debateCountPending = debateItems.length === 0 && (debateItemsSettling || debateExtractionRunning);

  /* -----------------------------------------------------------------------------------------------
   * GEO-3148. Where the pair land.
   *
   * Each tab says whether it has something, or that it does not know yet; `resolveLandingTab` takes
   * the first with something. Settled the way a one-off decision needs: `isFetching` as well as
   * `isLoading` on positions, because a cached answer reads as settled while the mount refetch is
   * still out, and yesterday's empty answer would land the pair somewhere for good.
   * ---------------------------------------------------------------------------------------------*/
  const opponentTabError = sessionQuery.error ?? positions.error ?? opponentEntitiesQuery.error;
  const opponentLandingPending =
    sessionQuery.isLoading || positions.isLoading || positions.isFetching || opponentClaimsSettling;
  const landingStates: [PickerTab, LandingState][] = [
    // A lookup that failed cannot say whether there are matches. It is not a reason to wait either.
    ['matches', opponentTabError ? 'empty' : listLandingState(opponentLandingPending, matchClaims.length)],
    // Empty while extraction is still running counts as empty: landing on "pulling the claims out"
    // is a weaker first screen than the next tab with something on it.
    ['debate', debateOffered ? listLandingState(debateItemsSettling, debateClaimCount) : 'empty'],
    ['related', listLandingState(relatedClaimsSettling, relatedClaims.length)],
    // Here a failure *is* something to land on: the tab draws it with a retry, where landing on
    // Explore would hide it.
    // Counted with "Hide agreed" applied, so a pair who agree on everything of theirs are not landed
    // on a tab that opens empty.
    ['opponent', opponentTabError ? 'filled' : listLandingState(opponentLandingPending, opponentClaimsShown.length)],
  ];
  const landingNow = landedForSession ?? resolveLandingTab(landingStates);

  React.useEffect(() => {
    if (landedForSession !== null || landingNow === null) return;
    setLanding({ sessionId, tab: landingNow });
  }, [landedForSession, landingNow, sessionId]);

  // Reported apart from the latch, and through the ref-guarded hook: Strict Mode runs a mount's
  // effects twice, both before the latch commits, and a report inside the latch's effect went out
  // twice. Keyed on the session, because the route reuses this page between rematches.
  useEffectOnceWhen(
    landingNow !== null,
    () =>
      captureLandingTab({
        rematchSessionId: sessionId,
        tab: landingNow!,
        choseFirst: chosenForSession !== null,
        matches: matchClaims.length,
        debateClaims: debateClaimCount,
        related: relatedClaims.length,
        theirPositions: opponentClaimsShown.length,
      }),
    sessionId
  );

  /**
   * Related and "From this debate" can leave the strip; the rest are always there. A choice — or a
   * landing — on a tab that has gone falls back to their positions rather than leaving the viewer on
   * a tab with no button to get back to it.
   */
  const isTabOffered = (candidate: PickerTab) =>
    candidate === 'related' ? relatedOffered : candidate === 'debate' ? debateOffered : true;
  //
  // Read from state alone — the choice or the latched landing, never `landingNow` — so the tab drawn
  // is always the one the queries were enabled for: `browsing` is derived from the same state, and
  // a landing on Explore drawn a render before it was latched would flash Explore's empty list.
  const settledTab: PickerTab | null =
    chosenForSession !== null && isTabOffered(chosenForSession)
      ? chosenForSession
      : landedForSession === null
        ? null
        : isTabOffered(landedForSession)
          ? landedForSession
          : 'opponent';
  /** Nothing chosen and the landing not latched yet: the list holds its skeleton and no tab is marked. */
  const landingPending = settledTab === null;
  // Matches stands in while the landing is pending. Nothing is drawn from it in that window — the
  // list is a skeleton — but every derivation below wants a tab.
  const tab: PickerTab = settledTab ?? 'matches';
  /** The tab the strip marks, which is none until there is one. */
  const activeTab = landingPending ? null : tab;

  // Recommended is offered only when a curator has a page for this pairing; the order is fixed, so
  // a source that appears doesn't reshuffle the ones already in the menu. The rest are in the hub's
  // order — All claims, Featured, My positions — so the same menu means the same thing on both
  // surfaces.
  /**
   * `hasRecommended` alone would drop the option — and with it the whole menu — for as long as the
   * next pairing's lookup is out, then put it back. Holding it while it is the source on screen is
   * the same rule `chosenRecommendedIsGone` applies to the selection: let go once the answer is in,
   * not while it is in flight.
   */
  const offersRecommended = hasRecommended || source === 'recommended';
  const sourceOptions = React.useMemo<HubFilterOption<ExploreSource>[]>(
    () =>
      (offersRecommended ? (['recommended', 'all'] as const) : (['all'] as const)).map(value => ({
        value,
        label: CLAIMS_SOURCE_LABELS[value],
      })),
    [offersRecommended]
  );

  /**
   * A menu of one is not a choice.
   *
   * Without a curated page for this pairing there is nothing to pick between, and Explore reads as
   * the hub's does: a search box and the two facet menus over one list.
   */
  const offersSourceMenu = sourceOptions.length > 1;

  const claims =
    tab === 'matches'
      ? matchClaims
      : tab === 'opponent'
        ? opponentClaims
        : tab === 'related'
          ? relatedClaims
          : tab === 'debate'
            ? debateClaims
            : source === 'recommended'
              ? curatedClaims
              : source === 'mine'
                ? viewerClaims
                : // Featured and All are the same list asked of two tags. Nothing is merged into either
                  // any more (GEO-2798): the Claims tab is the graph's answer, and the session's own rows
                  // live on the opponent's tab and under Recommended, where they always also were.
                  taggedClaims;

  // The same tab's rows that the pair have already debated, drawn apart below the new ones. Not on
  // Matches, which is the undebated ones by definition: those live under "Their positions".
  const debatedClaims =
    tab === 'matches'
      ? NO_CLAIMS
      : tab === 'opponent'
        ? opponentClaimsSplit.debated
        : tab === 'related'
          ? relatedClaimsSplit.debated
          : tab === 'debate'
            ? debateClaimsSplit.debated
            : source === 'recommended'
              ? curatedClaimsSplit.debated
              : source === 'mine'
                ? viewerClaimsSplit.debated
                : taggedClaimsSplit.debated;

  // Whether the list on screen was narrowed by its own query. Only the tagged sources are.
  const graphFiltered = tab === 'explore' && source === 'all';

  // Only the tagged sources are narrowed by their query. Matches, the two position tabs, Related and
  // Recommended are lists fetched by id, so nothing narrowed them on the way in and the filters below
  // run here.
  /**
   * The three dimensions the client-side lists narrow by, each testable on its own.
   *
   * One predicate each because they are read three times — the list, and a menu per dimension — and
   * a menu counted over anything other than the rows its *siblings* allow stops describing the list
   * under it. Both of these menus did that: neither knew about the search box (nor, while it lasted,
   * about the "Matches only" switch), so a menu could offer an option with a count beside it that
   * produced nothing when picked.
   *
   * What a menu does with its own selection follows from how that dimension combines. Space is OR
   * within the dimension, so its menu leaves its own selection out and each count answers "how many
   * rows would ticking this add". Topics are AND — {@link carriesEveryTopic} asks for every picked
   * one — so the topic menu is co-occurrence over the rows that already carry the selection, or it
   * would offer a topic with no claim in common with what is picked and empty the list (GEO-2696).
   */
  const passesSpace = React.useCallback(
    // Canonically, as everything that joins a row's space to another source's now is. A row carries
    // whichever spelling its source used — a Related row built from the graph carries bare hex where
    // the selection made on the opponent's tab carries geo-chat's — so a raw `includes` hid a row
    // under a filter naming that very space.
    (claim: DebateRematchClaim) =>
      spaceIds.length === 0 || spaceIds.some(spaceId => idEquals(spaceId, claim.claim.space_id)),
    [spaceIds]
  );
  const passesTopics = React.useCallback(
    (claim: DebateRematchClaim) => carriesPickedTopics(claim.claim.claim_entity_id, claim.claim.space_id),
    [carriesPickedTopics]
  );
  const passesSearch = React.useCallback(
    (claim: DebateRematchClaim) =>
      !debouncedSearch || claim.claim.claim.toLowerCase().includes(debouncedSearch.toLowerCase()),
    [debouncedSearch]
  );

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
  // What the menu offers before the viewer's own selection is folded back in. Split out because the
  // default is seeded from exactly this list rather than from the eligible set, which is the wider
  // and more obvious source.
  //
  // Not for the id shapes: those agreed once GEO-2798 normalized the facet's keys, and `normId` and
  // `uuidToHex` are the same function. It is that this list is the spaces that actually *have*
  // claims. Seeding from the eligible set would tick a space the viewer belongs to and the tag has
  // nothing in, landing them on an empty list behind a filter they never set. The cost is a second
  // request — the list loads unfiltered, then again narrowed — which is the price of not defaulting
  // to nothing.
  // On their tab, without the claims "Hide agreed" takes out: a menu counting them offered a space or
  // topic whose only claims are hidden, and picking it emptied the list. The list itself still reads
  // `claims`, so a claim agreed with on screen is held rather than dropped — see `visibleClaims`.
  const facetClaims = tab === 'opponent' ? opponentClaimsShown : claims;
  const offeredSpaces = React.useMemo(
    () =>
      graphFiltered
        ? taggedSpaceFacet.spaces
            .filter(space => canPublishDebateIn(space.id) && isClaimSpaceAllowed(space.id, spaceAllowlist))
            .map(space => ({ id: space.id, name: null, count: space.count }))
        : countBy(
            facetClaims
              .filter(claim => passesTopics(claim) && passesSearch(claim))
              .map(claim => ({ id: claim.claim.space_id, name: null }))
          ),
    [
      canPublishDebateIn,
      facetClaims,
      graphFiltered,
      passesSearch,
      passesTopics,
      spaceAllowlist,
      taggedSpaceFacet.spaces,
    ]
  );

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
      facetClaims
        .filter(claim => passesSpace(claim) && passesSearch(claim) && passesTopics(claim))
        .flatMap(claim =>
          (topicsFor(topicsByClaimId, claim.claim.claim_entity_id, claim.claim.space_id) ?? []).map(topic => ({
            id: topic.id,
            name: topic.name,
          }))
        )
    );
    return orderFacetOptions(source, topicIds);
  }, [
    facetClaims,
    graphFiltered,
    passesSearch,
    passesSpace,
    passesTopics,
    taggedTopicFacet.topics,
    topicIds,
    topicsByClaimId,
  ]);

  /**
   * "From this debate" is one debate's claims in one space, so the space and topic menus are not
   * drawn on it — and a selection carried over from Explore must not narrow a list whose filter bar
   * is not there to clear it. Search still applies.
   */
  const searchOnly = tab === 'debate';
  const narrowedClaims = React.useMemo(
    () =>
      graphFiltered
        ? claims
        : searchOnly
          ? claims.filter(passesSearch)
          : claims.filter(claim => passesSpace(claim) && passesTopics(claim) && passesSearch(claim)),
    [claims, graphFiltered, passesSearch, passesSpace, passesTopics, searchOnly]
  );

  /**
   * The already-debated rows under the same filters the viewer has set.
   */
  const narrowedDebatedClaims = React.useMemo(
    () =>
      graphFiltered
        ? debatedClaims
        : searchOnly
          ? debatedClaims.filter(passesSearch)
          : debatedClaims.filter(claim => passesSpace(claim) && passesTopics(claim) && passesSearch(claim)),
    [debatedClaims, graphFiltered, passesSearch, passesSpace, passesTopics, searchOnly]
  );

  /**
   * "Hide my positions" (GEO-2863): the viewer's answered backlog, out of the way.
   *
   * A toggle here where the hub collapses outright, because the same fact means opposite things on
   * the two surfaces. The hub hides an answered claim because browsing is about finding something
   * new and a claim you have taken a side on is one you are done with. Here `debateRequestGate`
   * refuses a request from someone holding no position — "with no position at all there is nothing
   * to agree about" — so an answered claim is one you can act on rather than one you are finished
   * with, and it cannot simply be collapsed the way the hub's is.
   *
   * It is on by default all the same, because the tabs then do one job each: what the pair can go
   * again on right now is Matches (GEO-3148), and this is the
   * other half of the flow — finding a claim to take a side on. Nothing becomes unreachable, since
   * a claim only the viewer has answered cannot be requested from either tab; the gate needs both
   * sides. And the claim answered *here*, which is the one a press away from a request, is kept by
   * the indefinite hold below rather than folded away under the viewer.
   *
   * What it hides is the backlog they arrived with — a reader with a long history of positions
   * scrolling past all of them to reach a claim they have not seen, which is what was reported.
   *
   * Never on "My positions", which is that backlog by definition and would be left permanently
   * empty — a broken tab rather than a filter. The switch is not drawn there either, so the state
   * cannot be set from a tab where it does nothing.
   */
  const hidesAnswered = tab === 'explore' && source !== 'mine' && hideMyPositions;

  /**
   * Whether the lookup carrying this viewer's side has answered for the list on screen.
   *
   * Needed because "geo-chat has no row for this claim" and "geo-chat has not been asked yet" both
   * arrive as a missing row, and over a tag catalogue the first is the *ordinary* case — most
   * claims have no row until somebody answers them. Reading them both as unknown meant a claim the
   * viewer answered right here went straight from unknown to answered, was never once recorded as
   * on-screen-unanswered, and so was dropped on the spot — with the indefinite hold that exists to
   * keep it doing nothing at all, on the exact path this page is for.
   *
   * Per source, because a different query answers for each: the tag's rows for Explore's two
   * catalogues, the curated lookup for Recommended.
   *
   * Two signals rather than one, and the difference is the error term — the same split the hub
   * keeps between `taggedAnswersReady` and `answersInFlight`.
   *
   * `rowsSettled` asks whether the answer can be *trusted*, which is what deciding a missing row
   * needs: a lookup that failed knows nothing, so its rows stay unknown and are never hidden.
   *
   * `rowsInFlight` asks only whether it is still running, which is what every gate about *waiting*
   * needs. Driving those off the error term too meant a failed metadata lookup — one `tabError`
   * deliberately treats as survivable — left the tab hiding every unclassified claim behind an
   * endless "Looking for claims…", with no way out but a reload.
   */
  const rowsSettled =
    source === 'recommended'
      ? !curatedClaimsQuery.isLoading && !curatedClaimsQuery.error
      : !taggedClaimsSettling && !taggedClaimsQuery.error;
  const rowsInFlight = source === 'recommended' ? curatedClaimsQuery.isLoading : taggedClaimsSettling;

  const answeredStateOf = React.useCallback(
    (claim: DebateRematchClaim): AnsweredState => {
      const position = chatPositionFor(claim.claim.claim_entity_id, claim.claim.space_id);
      if (position !== undefined) return position === null ? 'unanswered' : 'answered';
      // No row, and the lookup has answered: geo-chat holds no position for this viewer here, which
      // is a real answer. Still out, and it is not one — hiding on a lookup that has not run takes
      // a row away from under someone before anyone knew whether they had answered it.
      return rowsSettled ? 'unanswered' : 'unknown';
    },
    [chatPositionFor, rowsSettled]
  );

  // Kept for good rather than folded after a moment — see `holdMs`. A claim answered here is one
  // the viewer is a press away from requesting a debate on, so the switch hides the backlog they
  // arrived with and never the position they just took.
  const browseVisibleClaims = useCollapseAnswered(narrowedClaims, {
    keyOf: claimRowKey,
    answeredStateOf,
    enabled: hidesAnswered,
    holdMs: null,
    // Same reuse, same reason. A claim seen unanswered opposite one opponent is not seen for the
    // next, and with `holdMs: null` an inherited record keeps it on screen for good — exactly the
    // backlog this hides.
    resetKey: sessionId,
    // Same rule as the hub's: a row nobody has classified yet is not ready to be drawn while the
    // lookup that would classify it is still out.
    classifying: rowsInFlight,
  });

  /**
   * "Hide agreed" on their tab, through the same hook so it keeps the same promise: the agreed
   * claims the viewer arrived with are hidden, and one they agree with *here* stays. Taking a side
   * under the cursor and having the card vanish reads as the press missing, and the side they took
   * may be one they are about to flip.
   *
   * Its own instance rather than a second state on the one above, so a claim seen on Explore is not
   * remembered as seen here. Both sides are on the session's rows, which have settled by the time
   * the tab lists anything, so no row is ever unknown.
   */
  const hidesAgreed = tab === 'opponent' && hideAgreed;
  const agreedStateOf = React.useCallback(
    (claim: DebateRematchClaim): AnsweredState => (isAgreed(claim) ? 'answered' : 'unanswered'),
    [isAgreed]
  );
  const visibleClaims = useCollapseAnswered(browseVisibleClaims, {
    keyOf: claimRowKey,
    answeredStateOf: agreedStateOf,
    enabled: hidesAgreed,
    holdMs: null,
    resetKey: sessionId,
  });
  // The folded already-debated rows too, and through the hold for the same reason: their cards carry
  // the same position control, and the last one leaving takes the whole section with it.
  const visibleDebatedClaims = useCollapseAnswered(narrowedDebatedClaims, {
    keyOf: claimRowKey,
    answeredStateOf: agreedStateOf,
    enabled: hidesAgreed,
    holdMs: null,
    resetKey: sessionId,
  });
  /**
   * The switch is what left the new claims empty: it hid every one, or it hid every debated one and
   * there were no new ones. Either way the way out is the switch, not the filters or another tab.
   */
  const agreedEverything =
    hidesAgreed &&
    visibleClaims.length === 0 &&
    (narrowedClaims.length > 0 || (visibleDebatedClaims.length === 0 && narrowedDebatedClaims.length > 0));

  const hasFilters = Boolean(debouncedSearch || (!searchOnly && (spaceIds.length || topicIds.length)));

  // Only the tagged sources page; the rest arrive whole.
  //
  // "Hide my positions" used to empty each page as it landed, so the sentinel never left the
  // viewport and the list fetched the whole tag on the viewer's behalf. The server leaves those
  // claims out now (`excludeAnsweredBy`), so a page arrives with rows to show and there is nothing
  // to bound.
  const stillPaging = graphFiltered && visibleClaims.length === 0 && (taggedHasNextPage || rowsInFlight);

  /**
   * The list has rows and the switch is hiding all of them.
   *
   * The only empty state here that is true of a list *with rows in it*, which is why it has to come
   * before the ones about filters and about the corpus. Without it, `recommended` told a viewer
   * nothing was recommended for this pair when their recommendations were claims they had simply
   * already answered — and under a filter it was worse than wrong, offering "Clear filters" for
   * rows no filter was hiding.
   *
   * On the tagged source the backlog is left out by the server rather than collapsed, so "every
   * claim here is answered" arrives as an empty catalogue instead — the same shape as a catalogue
   * the filters leave nothing in. The two want different ways out, so an empty excluded catalogue
   * asks once how many it left out.
   */
  const excludedEmpty =
    graphFiltered &&
    Boolean(excludeAnsweredBy) &&
    !taggedCatalogLoading &&
    !taggedCatalogError &&
    taggedCatalog.length === 0 &&
    !taggedHasNextPage;
  const answeredHere = useTaggedAnsweredCount(claimsTagId, taggedFilters, excludedEmpty);
  const excludedEverything = excludedEmpty && (answeredHere.answeredCount ?? 0) > 0;
  const collapsedEverything =
    hidesAnswered && visibleClaims.length === 0 && (narrowedClaims.length > 0 || excludedEverything);
  const searchingMessage = hidesAnswered ? 'Looking for claims you haven’t answered yet…' : 'Looking for more claims…';

  // Not while the rows for what is already here are still coming. The two pull against each other
  // otherwise — see the hub, where fetching a page ahead of an empty list meant the catalog and the
  // row lookups ran back to back and the loading state never lifted.
  const mayFetchAhead = taggedHasNextPage && !rowsInFlight;

  // The same marker the hub draws, for the same gap: the moment after the viewer reaches the bottom,
  // where an unmarked pause reads as a list that has ended. Only with rows already showing — the
  // tab draws its own loading state before that.
  const loadingMore =
    graphFiltered && visibleClaims.length > 0 && taggedHasNextPage && (taggedFetchingNextPage || rowsInFlight);

  const sentinelRef = useInfiniteScrollSentinel({
    hasNextPage: mayFetchAhead,
    isFetchingNextPage: taggedFetchingNextPage,
    fetchNextPage: fetchNextTaggedPage,
    // Same reason as the hub's: a page of fifty can add three rows once the filter has run, so the
    // next one has to start well before the viewer reaches the bottom of what is showing.
    rootMargin: '1200px',
    // And measured against the layer this page scrolls in, not the viewport. `rootMargin` expands
    // the root, and the `fixed inset-0` wrapper below clips the sentinel before viewport
    // intersection is computed — so against the viewport the lead above buys nothing at all, which
    // is the same trap the hub had until it named its panel.
    rootSelector: '[data-rematch-scroll]',
  });

  // Each tab draws from a different set of queries, so each waits on its own. The allowlist narrows
  // the All tab alone now, so only that one waits for it.
  const tabIsLoading =
    sessionQuery.isLoading ||
    (tab === 'opponent' || tab === 'matches'
      ? // Through `opponentClaimsSettling` rather than listing its queries again, so the tab and the
        // badge above cannot come to different answers about the same list.
        positions.isLoading || opponentClaimsSettling
      : tab === 'related'
        ? relatedClaimsSettling
        : tab === 'debate'
          ? debateItemsSettling
          : tab === 'positions'
            ? viewerClaimsSettling
            : source === 'recommended'
              ? recommendedLoading || curatedClaimsQuery.isLoading
              : source === 'mine'
                ? viewerClaimsSettling
                : taggedClaimsSettling);

  // The menu, and the handlers that drive it. Defaults to the spaces the viewer belongs to
  // (GEO-2789).
  //
  // Gated on `tabIsLoading` rather than a hand-listed set of queries. GEO-2798 made this menu a
  // server facet instead of an accumulation over every row source, so the tab's own composite —
  // which already waits from the top of each chain, where a disabled lookup reports nothing — is
  // now the whole answer. `publishabilityPending` is the exception it cannot know about: an
  // unresolved space type reads as publishable, so the menu can still be offering a space this
  // page will go on to reject.
  const { facetSpaces, onSpaceToggle, onSpacesClear } = useSpaceFilterMenu({
    offeredSpaces,
    spaceIds,
    setSpaceIds,
    memberSpaceIds,
    // Every gate that decides `offeredSpaces`, because the seed is spent on whatever it sees. A
    // space offered provisionally and rejected a moment later takes the default with it.
    // `sourceDebateQuery` for the same reason from the other end: the source debate's own claim is
    // one of the exclusions, so until it lands a row-derived menu can still be counting its space.
    //
    // `isSettlingMemberships` is the same rule applied to the *viewer's* side of the match rather
    // than the menu's: sign-up sends one membership proposal per picked space and they land
    // seconds apart, so the first non-empty answer is a fraction of what they chose (GEO-2834).
    //
    // And only on Explore. That list is the one the default is about; the opponent's positions are
    // the claims *they* hold a side on, and seeding those with the spaces the viewer belongs to
    // would hide the opponent's positions everywhere else — the one thing the tab is for.
    //
    // Written as "not browsing" rather than "not the opponent's tab", which was the same sentence
    // while there were two tabs to choose between and stopped being one when GEO-2758 added a
    // third: the seed is spent against whatever menu it sees, and on Related that is a menu of one
    // space — the debated claim's — which Explore would then inherit as a deliberate-looking choice
    // the viewer never made.
    //
    // Not gated on the *source*, though. Explore always opens on a browsing one, so the seed is
    // already spent by the time My positions can be picked, and it inherits the filter bar from
    // whatever was showing — the same as switching between All claims and Featured does.
    pending:
      !browsing ||
      tabIsLoading ||
      publishabilityPending ||
      publishableSpacesLoading ||
      sourceDebateQuery.isLoading ||
      isSettlingMemberships ||
      (graphFiltered && !taggedSpaceFacet.settled),
  });

  const tabError =
    sessionQuery.error ??
    (tab === 'opponent' || tab === 'matches'
      ? (positions.error ?? opponentEntitiesQuery.error)
      : tab === 'related'
        ? // Discovery's failure is deliberately *not* here: it takes the tab out of the strip rather
          // than showing an error, so a viewer on Related is on it because rows were found. What can
          // still fail is turning those ids into rows.
          relatedRowsError
        : tab === 'debate'
          ? // The payload and the graph lookup that splits it are the list; geo-chat's rows beside them
            // are metadata, as on All claims.
            (extractedClaimsQuery.error ?? debateEntitiesQuery.error ?? null)
          : source === 'mine'
            ? // The same two lookups the opponent's tab is built from, asked about the viewer. Shared
              // with the Positions badge, which has to call an outage an outage rather than a zero.
              viewerTabError
            : source === 'all'
              ? // The page is the list, and it carries everything a row is built from — so its failure
                // is the only one that leaves nothing to show. geo-chat's row lookup is metadata beside
                // it: losing it costs the faces and the readiness, not the claims, and blanking the tab
                // for that trades a short list for no list.
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
    //
    // `complete` rather than `settled`: with a search running, the counts are over the ids fetched
    // so far, and a topic whose claims are on a later page is missing from a menu that is otherwise
    // perfectly good to look at. Reconciling against that drops a selection that was never invalid.
    const resolved = !topicsSettling && !tabIsLoading && !tabError && (!graphFiltered || taggedTopicFacet.complete);
    setTopicIds(current => keepSelectableTopics(current, facetTopics, resolved));
  }, [facetTopics, graphFiltered, tabError, tabIsLoading, taggedTopicFacet.complete, topicsSettling]);

  // The curated tab groups by block rather than listing flat, but narrows on the same filters.
  const showsSections = tab === 'explore' && source === 'recommended';
  const visibleSections = React.useMemo(() => {
    if (!showsSections) return [];
    // Canonical on both sides. The keys are row ids and the lookups are the curator's, which come
    // from the graph — so a raw join dropped any claim whose row geo-chat supplied, which is to say
    // exactly the curated claims with session history.
    const visibleById = new Map(visibleClaims.map(claim => [normId(claim.claim.claim_entity_id), claim]));

    return recommendedSections
      .map(section => ({
        ...section,
        claims: section.claimIds
          .map(claimId => visibleById.get(normId(claimId)))
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
  const scopedSpaceIds = React.useMemo(() => {
    // Deduplicated canonically, but subscribed to in a real spelling. A row carries whichever
    // spelling its source used, so the same space reached through two sources — the graph's bare
    // hex from a Related row, geo-chat's UUID from a participant — counted as two and was
    // subscribed to twice, which is two scopes and two deliveries of every event on it.
    //
    // geo-chat's spelling wins where both are seen, since geo-chat is what the scope is opened
    // against: the participants are added last and overwrite.
    const byCanonical = new Map<string, string>();
    // Related included since GEO-2758. It is a visible source like the others, so without its
    // spaces here a claim reachable only through Related holds no `claims_changed` subscription and
    // the opponent's moves on the tab in front of the viewer wait for the next poll.
    // The whole lists, already-debated rows included: those are still on screen, under their own
    // heading, and can still be requested.
    for (const claim of [
      ...opponentClaimsListed,
      ...viewerClaimsListed,
      ...curatedClaimsListed,
      ...taggedClaimsListed,
      ...relatedClaimsListed,
      ...debateItems.flatMap(item => (item.row ? [item.row] : [])),
    ])
      byCanonical.set(normId(claim.claim.space_id), claim.claim.space_id);
    for (const participant of participants)
      byCanonical.set(normId(participant.profile_space_id), participant.profile_space_id);
    return [...byCanonical.values()].sort((a, b) => a.localeCompare(b));
  }, [
    curatedClaimsListed,
    taggedClaimsListed,
    opponentClaimsListed,
    viewerClaimsListed,
    relatedClaimsListed,
    debateItems,
    participants,
  ]);
  useDebateGatewaySpaceScopes(scopedSpaceIds, geoChatAuthenticated && scopedSpaceIds.length > 0);

  // Readiness is reported by the card. geo-chat now carries it on the rematch claims
  // response itself; the per-space debate-claims endpoint is the fallback for a backend that
  // predates that, and it costs one query per space on screen.
  const claimsOnScreen = React.useMemo(() => [...claims, ...debatedClaims], [claims, debatedClaims]);
  const { byClaimId: readinessByClaimId } = useClaimReadinessByClaimId({
    claims: claimsOnScreen,
    unresolved:
      tab === 'opponent' || tab === 'matches'
        ? opponentClaimsQuery.isLoading || Boolean(opponentClaimsQuery.error)
        : tab === 'debate'
          ? debateRowsQuery.isLoading || Boolean(debateRowsQuery.error)
          : source === 'mine'
            ? viewerClaimsQuery.isLoading || Boolean(viewerClaimsQuery.error)
            : source === 'all'
              ? taggedClaimsQuery.isLoading || Boolean(taggedClaimsQuery.error)
              : curatedClaimsQuery.isLoading || Boolean(curatedClaimsQuery.error),
  });

  // A room's session carries geo-chat's `debates` sentinel rather than a space and the debate route
  // 404s on it; the claim carries the real one. Keyed by session, which this component is reused
  // across rather than remounted for.
  const requestSpaceRef = React.useRef<{ sessionId: string; spaceId: string } | null>(null);
  const requestSpaceId = session?.request?.claim.space_id ?? null;
  if (session && requestSpaceId) requestSpaceRef.current = { sessionId: session.id, spaceId: requestSpaceId };

  /** The converted debate this page has started walking into, so the effect below walks once. */
  const enteringConvertedDebateRef = React.useRef<string | null>(null);
  /** Set when another of the viewer's tabs took the converted debate (GEO-3149). */
  const [convertedElsewhere, setConvertedElsewhere] = React.useState<{
    debateId: string;
    spaceId: string;
    path: string;
  } | null>(null);

  /**
   * The session is over and this page is about to navigate away — whoever ended it.
   *
   * Leaving is not the only way out: the other person leaving ends the session too, and so does a
   * request being accepted or the browsing window lapsing. All of them land here as a status the
   * effect below redirects on, and in the render before that redirect the header must not start
   * rebuilding itself for a page nobody will see.
   *
   * `inDebateRoom` is the exception, and it is about the navigating rather than the ending: in a
   * room an expired session is rejoined in place (see the effect), so the page stays. Freezing the
   * header there would hold it frozen over a session that is coming back, which is the one thing
   * this flag must never outlive. A room's own Leave is a `router.push` with no mutation behind
   * it, so there is no window to hold open either. Converted is not excepted — that redirects out
   * of a room as much as into one.
   */
  const sessionEnded =
    session !== null &&
    ((session.status === 'converted' && Boolean(session.converted_debate_id)) ||
      ((session.status === 'ended' || session.status === 'expired') && !inDebateRoom));

  React.useEffect(() => {
    if (!session) return;
    if (session.status === 'converted' && session.converted_debate_id) {
      // The requester walks into the room the same way the accepter does, and without the intent
      // `DebateCoordinator` reads the walk as an unannounced debate and reopens the dialog.
      const remembered = requestSpaceRef.current?.sessionId === session.id ? requestSpaceRef.current.spaceId : null;
      const spaceId = validateSpaceId(session.source_space_id) ? session.source_space_id : remembered;
      if (!spaceId) return;
      const debateId = session.converted_debate_id;
      if (enteringConvertedDebateRef.current === debateId) return;
      enteringConvertedDebateRef.current = debateId;
      const path = `/space/${spaceId}/debates/${debateId}`;
      // GEO-3149. Every tab on this picker sees the conversion at once. Only the one the viewer is
      // looking at walks into the room; the rest say where the debate went and offer the way in.
      void claimDebateEntry(debateRoomClaimKey(debateId)).then(go => {
        if (!go) {
          setConvertedElsewhere({ debateId, spaceId, path });
          return;
        }
        markEnteringDebate(debateId);
        router.replace(path);
      });
    } else if (session.status === 'ended' || session.status === 'expired') {
      // Never out of a room: geo-chat expires a `browsing` session once either party has been
      // offline 90 seconds, which is what waiting for someone looks like.
      if (!inDebateRoom) returnFromSession(session);
      // geo-chat replaces a finished room session on the next join, which someone who never left
      // would not otherwise send. Once per session, so a refusal cannot loop.
      else if (roomRejoin && rejoinedForRef.current !== session.id) {
        const sessionId = session.id;
        rejoinedForRef.current = sessionId;
        void roomRejoin().then(joined => {
          if (joined) return;
          const failures = rejoinFailuresRef.current;
          const count = failures.sessionId === sessionId ? failures.count + 1 : 1;
          rejoinFailuresRef.current = { sessionId, count };
          if (count >= ROOM_REJOIN_ATTEMPTS) return;
          setTimeout(() => {
            if (rejoinedForRef.current !== sessionId) return;
            rejoinedForRef.current = null;
            setRejoinRetry(tick => tick + 1);
          }, ROOM_REJOIN_RETRY_MS);
        });
      }
    }
  }, [inDebateRoom, rejoinRetry, returnFromSession, roomRejoin, router, session]);

  const leave = () => {
    // `leaveDebateRematch` ends the session for *both* people and puts both on a cooldown. In a
    // room that is the wrong verb: leaving is per person and the room stays open to come back to,
    // so this walks out and lets `useRoomPresence` report the departure on unmount.
    if (inDebateRoom) {
      router.push(NavUtils.toExplore());
      return;
    }
    leaveRequestedRef.current = true;
    leaveSession.mutate(undefined, {
      onSuccess: returnFromSession,
      onError: () => {
        leaveRequestedRef.current = false;
      },
    });
  };

  useLeaveRematchOnExit({
    sessionId,
    session,
    leave: () => leaveSession.mutate(),
    exiting: () => exitStartedRef.current || leaveRequestedRef.current,
  });

  /** The last request failure, and whether the claim it was sent for is still on screen. */
  const requestError = createRequest.error instanceof Error ? createRequest.error.message : null;
  const requestErrorTarget = requestError ? createRequest.variables : undefined;
  // Compared canonically: the error carries whichever spelling the failed request used, and the row
  // carries this page's.
  const hasRequestTarget = (claim: DebateRematchClaim) =>
    requestErrorTarget != null &&
    idEquals(claim.claim.claim_entity_id, requestErrorTarget.claim_id) &&
    idEquals(claim.claim.space_id, requestErrorTarget.source_space_id);
  const requestErrorHasCard =
    requestErrorTarget !== undefined &&
    (visibleDebatedClaims.some(hasRequestTarget) ||
      (showsSections
        ? visibleSections.some(section => section.claims.some(hasRequestTarget))
        : visibleClaims.some(hasRequestTarget)));

  /** On "From this debate", who said the claim — the one thing that tab knows that a row does not. */
  const debateContextFor = (claim: DebateRematchClaim) => {
    if (tab !== 'debate') return null;
    const extracted = debateItemByClaimId.get(normId(claim.claim.claim_entity_id));
    return extracted ? <DebateTurnCaption speaker={debateSpeakerOf(extracted)} /> : null;
  };

  useRegisterRematchPanelContext({
    sessionId,
    session,
    currentUserId,
    opponentPresent: !inDebateRoom || (roomPresence?.opponentPresent ?? false),
    canPublishDebateIn,
    createRequest,
  });

  const renderClaimCard = (claim: DebateRematchClaim, previouslyDebated = false) => (
    <RematchClaimCard
      key={claim.claim.claim_entity_id}
      claim={claim}
      previouslyDebated={previouslyDebated}
      context={debateContextFor(claim)}
      session={session}
      currentUserId={currentUserId}
      chatPosition={chatPositionFor(claim.claim.claim_entity_id, claim.claim.space_id)}
      readiness={readinessByClaimId.get(normId(claim.claim.claim_entity_id)) ?? null}
      onRequest={() =>
        createRequest.mutate({
          source_space_id: claim.claim.space_id,
          claim_id: claim.claim.claim_entity_id,
          format_id: defaultDebateFormatId,
        })
      }
      busy={createRequest.isPending || session?.status === 'request_pending'}
      // Associate the shared mutation error with the claim that initiated it.
      requestError={hasRequestTarget(claim) ? requestError : null}
    />
  );

  /**
   * "From this debate" in extraction order, published rows and unpublished claims interleaved — the
   * order D4 holds still. Published rows come from `visibleClaims`, so search and the already-debated
   * fold apply to them exactly as on every other tab; unpublished ones are only searched.
   */
  const visibleClaimKeys = new Set(visibleClaims.map(claim => normId(claim.claim.claim_entity_id)));
  const visibleDebateItems =
    tab === 'debate'
      ? debateItems.filter(item =>
          item.row
            ? visibleClaimKeys.has(normId(item.row.claim.claim_entity_id))
            : !debouncedSearch || item.claim.text.toLowerCase().includes(debouncedSearch.toLowerCase())
        )
      : [];
  const visibleCount = tab === 'debate' ? visibleDebateItems.length : visibleClaims.length;

  /**
   * GEO-3148. The strip, left to right in the order the pair land on them, so wherever they land the
   * tabs before it are the ones that had nothing; My positions, never landed on, comes last. A list,
   * as the hub's is, so a tab is its label and its count and nothing else to keep in step.
   */
  const pickerTabs: PickerTabSpec[] = [
    {
      id: 'matches',
      label: 'Matches',
      count: { value: matchClaims.length, pending: opponentCountPending, pendingLabel: 'Counting matches' },
    },
    // Offered whenever the session came out of a debate, including while extraction is still
    // running, because the list filling in is the point (GEO-2870).
    ...(debateOffered
      ? [
          {
            id: 'debate',
            label: 'From this debate',
            count: {
              value: debateClaimCount,
              pending: debateCountPending,
              pendingLabel: 'Counting claims from this debate',
            },
          } satisfies PickerTabSpec,
        ]
      : []),
    // No count: the list is capped at 25, so a number would mostly report the cap. Drawn while its
    // rows are still out — see `relatedOffered` for why the slot is held rather than filled late.
    ...(relatedOffered ? [{ id: 'related', label: 'Related' } satisfies PickerTabSpec] : []),
    // "Their positions" rather than "Lobby": the hub's Lobby is who is around to debate, and this is
    // what one person has taken a side on. The header says whose room it is, so no name is needed.
    {
      id: 'opponent',
      label: 'Their positions',
      count: { value: opponentPositionCount, pending: opponentCountPending, pendingLabel: 'Counting positions' },
    },
    // The whole catalogue, and the last place the pair can land.
    { id: 'explore', label: 'Explore' },
    // The viewer's own backlog, promoted out of Explore's source menu the way GEO-2863 promoted the
    // hub's, and named for whose it is now that it sits beside theirs.
    {
      id: 'positions',
      label: 'My positions',
      count: { value: viewerPositionCount, pending: viewerCountPending, pendingLabel: 'Counting your positions' },
    },
  ];

  const pendingRequest = session?.status === 'request_pending' ? session.request : null;
  const incomingRequest = pendingRequest?.recipient_user_id === currentUserId ? pendingRequest : null;
  // The other side of the same pending request: the viewer asked, and is waiting to hear back.
  const outboundRequest = pendingRequest?.requester_user_id === currentUserId ? pendingRequest : null;
  const incomingRequestParticipants =
    incomingRequest && session
      ? session.participants.map(participant => {
          const requester = participant.user_id === incomingRequest.requester_user_id;
          const position = requester ? incomingRequest.requester_position : incomingRequest.recipient_position;
          return {
            ...participant,
            position,
            // Our word, not the request's. geo-chat labels the sides of a claim it still calls
            // factual "Verify" and "Dispute", and this pair sits beside pills that can only
            // publish an Agree — see `positionSummariesFromCounts`.
            position_label: responsePositionLabel(position),
          };
        })
      : [];

  if (convertedElsewhere) {
    return (
      <DebateOpenElsewhereScreen
        claim={session?.request?.claim.claim}
        onOpenHere={() => {
          markEnteringDebate(convertedElsewhere.debateId);
          router.replace(convertedElsewhere.path);
        }}
        // Not `back()`: behind this page is usually the room the session came from, which would
        // only offer the same way in again.
        onGoBack={() => router.replace(`/space/${convertedElsewhere.spaceId}/debates`)}
      />
    );
  }

  const leaveButton = (
    <button
      type="button"
      aria-label="Leave debate"
      title="Leave debate"
      onClick={leave}
      disabled={leaveSession.isPending}
      className="grid size-8 shrink-0 place-items-center rounded-full border border-grey-02 text-grey-04 transition-colors hover:text-text disabled:opacity-50"
    >
      <LeaveIcon />
    </button>
  );

  return (
    // Below the entity side panel (z-200) on purpose: a claim opens there rather than navigating,
    // and the panel has to land on top. Still above the navbar (z-60) and the app's z-100 band, so
    // the session keeps the screen to itself.
    // `overflow-x-hidden` is load-bearing, not tidying: CSS computes the other axis to `auto` as
    // soon as one of them isn't `visible`, so `overflow-y-auto` alone left this layer horizontally
    // scrollable. Anything wider than the viewport — the tab strip, on a phone — panned the whole
    // screen sideways instead of scrolling itself.
    <div data-rematch-scroll className="fixed inset-0 z-[150] overflow-x-hidden overflow-y-auto bg-white text-text">
      <main className="mx-auto min-h-dvh w-full max-w-[720px] px-5 pt-8 pb-8 mobile:px-8">
        {/* Pinned together, tabs included. The list pages forever, so both the tab strip and the
            controls under it were a full scroll away by the time the viewer wanted either — and
            pinning the filters alone would have left them floating over a tab strip scrolling
            past behind them. Bleeds to the layer's edges so the page passes under it rather than
            beside it, and `-mt-8` lets it sit flush at the top once stuck. */}
        <div className="sticky top-0 z-20 -mx-5 -mt-8 bg-white px-5 pt-8 pb-3 mobile:-mx-8 mobile:px-8">
          {/* The display name only: `remoteName` falls back to a raw id, which reads badly in
              "Waiting for …", and the pill has its own fallback. */}
          {roomPresence && (
            <DebateRoomPresenceIndicator
              presence={roomPresence}
              opponentName={remoteParticipant?.display_name || undefined}
            />
          )}
          <h1 className="sr-only">Rematch {remoteName}</h1>
          {/* GEO-2992: the pair, at the top of the column the viewer is already reading. This is
              where the unmute control lives now — the 200px dock it replaced was pinned to the
              bottom-right corner of the viewport, outside the column, and people were not finding
              it. Inside the sticky block on purpose: the claim list pages forever, and a control
              that scrolls away has the dock's problem in a different place. */}
          {/* Leave rides in the header rather than at the end of the tab row: it belongs to you,
              so it sits in your card, opposite "View profile" on theirs. That leaves the tab strip
              the full width it was sharing.

              Drawn either way, because this page is a `fixed inset-0` layer over the whole app and
              this button is the only way off it. Signed out, mid identity exchange, or on a failed
              session lookup there is no pair to draw — and a picker with no exit is worse than one
              with no header. */}
          <div className="mb-4">
            {session && currentUserId ? (
              <RematchVoiceHeader
                session={session}
                currentUserId={currentUserId}
                leaveAction={leaveButton}
                // `isSuccess` as well as `isPending`: the session is ended the moment the mutation
                // answers, and the redirect lands a beat later. That gap is the whole window in
                // which the controls used to vanish. `sessionEnded` covers the same window when it
                // was the other person who left, which reaches this page as a status change with no
                // mutation of ours behind it.
                exiting={leaveSession.isPending || leaveSession.isSuccess || sessionEnded}
              />
            ) : (
              <div className="flex justify-end">{leaveButton}</div>
            )}
          </div>
          <header className="mb-4">
            <ScrollableTabRow activeKey={activeTab} analyticsLabelPrefix="Debate rematch" className="gap-6">
              {pickerTabs.map(spec => (
                <TabButton
                  key={spec.id}
                  label={spec.label}
                  count={spec.count}
                  active={activeTab === spec.id}
                  onClick={() => setTab(spec.id)}
                />
              ))}
            </ScrollableTabRow>
          </header>

          <div className="flex flex-col gap-3">
            {/* Pinned above the filters and the search box, where the hub's claims tab keeps it —
                and inside the sticky block rather than over it, because two stickies would both
                claim `top-0` and overlap. A request sent from here otherwise left no trace on the
                surface that sent it: the claim card looks exactly as it did before. */}
            {outboundRequest && currentUserId ? (
              <RematchRequestCard request={outboundRequest} participants={participants} currentUserId={currentUserId} />
            ) : null}

            {searchOnly ? null : (
              <SpaceTopicFilters
                analyticsSurface="rematch"
                spaceIds={spaceIds}
                onSpaceToggle={onSpaceToggle}
                onSpacesClear={onSpacesClear}
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
                // Explore's alone, and it has to say so rather than falling through: `hidesAnswered`
                // is gated on that tab, so anywhere else the switch would draw a control that could
                // not change a single row under it. Never on "My positions", which is the backlog it
                // hides. The opponent's tab lost its "Matches only" switch to the Matches tab.
                trailing={
                  tab === 'explore' ? (
                    <HideMyPositionsSwitch
                      analyticsSurface="rematch"
                      checked={hideMyPositions}
                      onChange={setHideMyPositions}
                    />
                  ) : tab === 'opponent' ? (
                    <HideAgreedSwitch analyticsSurface="rematch" checked={hideAgreed} onChange={setHideAgreed} />
                  ) : null
                }
                leading={
                  // Only where a curator has made a page for this pairing. Without one there is a
                  // single option, and a menu of one is a control that cannot do anything.
                  tab === 'explore' && offersSourceMenu ? (
                    <HubFilterMenu
                      label={CLAIMS_SOURCE_LABELS[source === 'mine' ? 'all' : source]}
                      analytics={{ name: 'Claims source', surface: 'rematch' }}
                      options={sourceOptions}
                      value={source === 'mine' ? 'all' : source}
                      onChange={setChosenSource}
                    />
                  ) : null
                }
              />
            )}
            <Input
              withSearchIcon
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              placeholder="Search claims"
              aria-label="Search claims"
            />
          </div>
        </div>

        {/* A request error belongs on the card it was sent from; this line is the fallback for when
            that card is no longer drawn — a tab swap, a search, a filter. Losing the message because
            the list moved underneath it is how the failure read as silence (GEO-2807). */}
        {leaveSession.error instanceof Error ? (
          <Text color="red-01" className="mb-4">
            {leaveSession.error.message}
          </Text>
        ) : requestError && !requestErrorHasCard ? (
          <div role="alert" className="mb-4">
            <Text color="red-01">{requestError}</Text>
          </div>
        ) : null}
        {session?.request?.status === 'expired' && session.request.cancellation_reason && (
          <Text color="red-01" className="mb-4">
            {rematchCancellationMessage(session.request.cancellation_reason)}
          </Text>
        )}

        {/* GEO-3148. The one thing this list cannot show by itself: what turns a claim here into a
            match. Only once there are claims to say it about. */}
        {activeTab === 'opponent' && !tabIsLoading && visibleCount > 0 ? (
          <Text as="p" variant="footnote" color="grey-04" className="mb-3">
            Take the other side of one of {remoteFirstName}’s claims to make it a match you can debate.
          </Text>
        ) : null}

        <HubQueryState
          analyticsSurface="rematch"
          // Only what the visible tab actually draws from, and only while it has nothing to show.
          // Holding every tab on the slowest query meant the session's own claims — which arrive in
          // one round trip — sat behind a graph-wide scan they don't come from.
          // `stillPaging` is deliberately not in here. A page whose rows the session's own
          // exclusions empty is a thing to say — see `searchingMessage` below — not a skeleton to
          // sit behind while the sentinel fetches the next one.
          isLoading={
            // Before the landing is decided there is no tab to draw, and drawing the stand-in's list
            // would flash a tab nobody landed on.
            landingPending ||
            ((tabIsLoading || answeredHere.isLoading) &&
              (showsSections ? visibleSections.length === 0 : visibleCount === 0))
          }
          error={landingPending ? null : tabError}
          isEmpty={showsSections ? visibleSections.length === 0 : visibleCount === 0}
          emptyMessage={
            stillPaging
              ? searchingMessage
              : collapsedEverything
                ? 'You’ve answered every claim here. Turn off “Hide my positions” to see them, or pick another space or topic.'
                : agreedEverything
                  ? visibleDebatedClaims.length > 0
                    ? `You and ${remoteName} agree on every claim here you haven’t debated. Turn off “Hide agreed” to see them.`
                    : `You and ${remoteName} agree on every claim here. Turn off “Hide agreed” to see them.`
                  : hasFilters
                    ? 'No claims match these filters.'
                    : claims.length === 0 && debatedClaims.length > 0
                      ? `You and ${remoteName} have already debated every claim here.`
                      : tab === 'matches'
                        ? debatedMatchCount > 0
                          ? `You’ve already debated every claim you and ${remoteName} disagree on. Pick a side on another of their claims to find a new one.`
                          : opponentHasPositions
                            ? `You and ${remoteName} haven’t taken opposite sides on anything yet. Pick a side on one of their claims to start a debate.`
                            : `You and ${remoteName} haven’t taken opposite sides on anything yet. Once ${remoteName} takes a side on a claim, take the other one to start a debate.`
                        : tab === 'opponent'
                          ? `${remoteName} hasn’t responded yet. When they do, those claims show up here.`
                          : tab === 'debate'
                            ? debateExtractionRunning
                              ? 'Pulling the claims out of your debate. They appear here as they’re found.'
                              : 'No claims from this debate are left to debate.'
                            : tab === 'related'
                              ? // Reachable even though the tab only appears when neighbours were found: every
                                // one of them can still be ruled out by this session — already debated, or in a
                                // space that cannot carry a published debate.
                                'No related claims are left to debate.'
                              : source === 'recommended'
                                ? `Nothing recommended for you and ${remoteName} yet.`
                                : source === 'mine'
                                  ? 'You haven’t taken a position on any claims yet.'
                                  : 'No other eligible claims are available yet.'
          }
          // Each dead end has its own way out. Ordered by how much the viewer has to give up:
          // clearing their filters, then leaving the tab or the source they picked.
          emptyAction={
            stillPaging
              ? undefined
              : collapsedEverything
                ? { label: 'Show my positions', onClick: () => setHideMyPositions(false) }
                : agreedEverything
                  ? { label: 'Show agreed claims', onClick: () => setHideAgreed(false) }
                  : hasFilters
                    ? {
                        label: 'Clear filters',
                        onClick: () => {
                          setSearch('');
                          // The menu's own clear row, so this counts as choosing the unfiltered list and
                          // the default cannot put its spaces back.
                          onSpacesClear();
                          setTopicIds([]);
                        },
                      }
                    : tab === 'matches'
                      ? // Their positions is where a match is made, and where the debated ones are kept.
                        // With none of those there is nothing of theirs to oppose, and the catalogue is
                        // the way on.
                        opponentHasPositions
                        ? { label: `See ${remoteFirstName}’s positions`, onClick: () => setTab('opponent') }
                        : { label: 'Explore claims', onClick: () => setTab('explore') }
                      : tab === 'opponent'
                        ? // GEO-2861. An opponent who has answered nothing is a dead end this tab cannot
                          // resolve, and the catalogue next door is the whole of the way out of it.
                          { label: 'Explore claims', onClick: () => setTab('explore') }
                        : source === 'mine'
                          ? // The same dead end one tab over: a viewer who has answered nothing
                            // cannot fill this list from here, and the whole corpus is next door.
                            { label: 'Show all claims', onClick: () => setTab('explore') }
                          : undefined
          }
        >
          {showsSections ? (
            // Each data block on the curator's page is its own section, in page order.
            <div className="flex flex-col gap-4">
              {visibleSections.map(section => (
                <RecommendedSection key={section.id} name={section.name} count={section.claims.length}>
                  <HubCardList>{section.claims.map(claim => renderClaimCard(claim))}</HubCardList>
                </RecommendedSection>
              ))}
            </div>
          ) : tab === 'debate' ? (
            <HubCardList>
              {visibleDebateItems.map(item =>
                item.row ? (
                  renderClaimCard(item.row)
                ) : (
                  <UnpublishedDebateClaimCard
                    key={item.claim.id}
                    claim={item.claim}
                    speaker={debateSpeakerOf(item.claim)}
                  />
                )
              )}
            </HubCardList>
          ) : (
            <HubCardList>{visibleClaims.map(claim => renderClaimCard(claim))}</HubCardList>
          )}
        </HubQueryState>

        {/* GEO-3148. The end of the matches, and the way to everything of theirs. Matches arrive whole,
            so the end of the list really is the end. */}
        {activeTab === 'matches' && !tabIsLoading && visibleCount > 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 text-center" data-testid="rematch-matches-end">
            <Text as="p" variant="footnote" color="grey-04">
              That’s every match.
            </Text>
            <HubPillButton
              analyticsSurface="rematch"
              analyticsLabel="Debate rematch See all their positions"
              onClick={() => setTab('opponent')}
            >
              {opponentCountPending
                ? `See all of ${remoteFirstName}’s positions`
                : `See all ${opponentPositionCount} of ${remoteFirstName}’s positions`}
            </HubPillButton>
          </div>
        ) : null}

        {/* Explore pages again (GEO-2798), so the sentinel is back — for the tagged sources only.
            Recommended is a curator's page, and the opponent's positions and the viewer's own are
            whole lists fetched by id; all three arrive complete.

            Gated on `graphFiltered` rather than on the tab: the tagged query keeps its cached pages
            while it is disabled, so `taggedHasNextPage` still answers true under a source that is
            not paging anything, and the sentinel would sit in view asking a list nobody is looking
            at for its next page. */}
        {loadingMore ? (
          // Its own breathing room rather than the column's. The cards above sit `gap-2` apart
          // inside their list, and this lands a rung further out on the column's `gap-3` — close
          // enough to read as one more card, clipped, rather than as the list saying it is still
          // working. Pushed clear, it reads as what it is.
          <div data-testid="rematch-claims-loading-more" className="pt-2">
            <HubSkeleton rows={2} />
          </div>
        ) : null}

        {mayFetchAhead && graphFiltered ? (
          <div ref={sentinelRef} data-testid="rematch-claims-scroll-sentinel" className="h-px" />
        ) : null}

        {/* GEO-3120. Claims this pair have already debated, kept out of the list above and folded
            away here. Hidden by default because a pair on their sixth debate is looking for
            something new; still reachable because going again on one is a choice geo-chat allows. */}
        {!tabIsLoading && visibleDebatedClaims.length > 0 ? (
          <div className="mt-6" data-testid="rematch-already-debated">
            <RecommendedSection
              key={`${sessionId}:${tab}`}
              name={`Already debated with ${remoteName}`}
              count={visibleDebatedClaims.length}
              defaultOpen={false}
              showCount
            >
              <HubCardList>{visibleDebatedClaims.map(claim => renderClaimCard(claim, true))}</HubCardList>
            </RecommendedSection>
          </div>
        ) : null}
      </main>

      {incomingRequest && session && currentUserId && (
        <DebateRequestDialog
          claim={incomingRequest.claim.claim}
          participants={incomingRequestParticipants}
          currentUserId={currentUserId}
          formatId={incomingRequest.turn_format_id}
          openRounds={requestOpenRounds(incomingRequest.max_rebuttal_rounds)}
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
    // Two sources in one map — geo-chat's per-space response and the rows themselves — so both are
    // keyed canonically, and {@link readinessFor} reads it the same way. Raw, the second loop's
    // entries could never overwrite the first's for the same claim.
    for (const claim of perSpace.claims) {
      map.set(normId(claim.claim_entity_id), {
        viewer_debate_ready: claim.viewer_debate_ready,
        readiness_disabled_reason: claim.readiness_disabled_reason,
      });
    }
    for (const claim of claims) {
      if (claim.viewer_debate_ready === undefined) continue;
      map.set(normId(claim.claim.claim_entity_id), {
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
  requestError,
  previouslyDebated = false,
  context = null,
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
  /** The last request error for this claim. */
  requestError?: string | null;
  /** The pair have debated this claim against each other before (GEO-3120). */
  previouslyDebated?: boolean;
  /** Drawn under the card, above any refusal — "From this debate" says who said the claim. */
  context?: React.ReactNode;
}) {
  // `true` off a room, so this route's gate is unchanged. See `useRoomOpponentPresent`.
  const roomOpponentPresent = useRoomOpponentPresent();
  const remotePosition = claim.participants.find(side => side.user_id !== currentUserId)?.position ?? null;

  // A claim whose stored kind didn't parse still has to render; 'stance' is the fallback
  // `responsePositionLabel` already applies, so the labels agree either way.
  const responseKind = resolveClaimResponseKind();

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
  const inFlightResponse =
    optimisticResponse !== undefined ? optimisticResponse : responseIndexing.pending?.expectedResponse;

  const localPosition =
    inFlightResponse === undefined
      ? (chatPosition ?? null)
      : inFlightResponse === null
        ? null
        : inFlightResponse === 'positive';

  const { openSidePanel } = useEntitySidePanel();

  const positions = React.useMemo(() => rematchPositionSummaries(claim, session), [claim, session]);

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
        : { position: chatPosition, position_label: responsePositionLabel(chatPosition) },
    viewer_debate_ready: claimReadiness?.viewer_debate_ready ?? false,
    readiness_disabled_reason: claimReadiness?.readiness_disabled_reason ?? null,
  };

  return (
    <MatchmakingClaimCard
      claim={claim.claim}
      positions={positions}
      readiness={readiness}
      // The card's own offer is replaced rather than hidden. A rematch request is its own mutation
      // with its own gating, but it is the same offer to the reader — so it wears the same control
      // in the same place instead of a footer button of its own (GEO-2825). Nothing to watch here
      // either: the picker has no active-debate signal, and it is mid-session anyway, so
      // `activeDebate` has no reader.
      // The picker already has the session rows. Use their shared rematch control instead of
      // falling through to the per-claim lookup used by the entity panel.
      hideEndSlot
      // Only when there is something to offer, the same way the side panel renders its control only
      // once a match exists. Rendering it unconditionally put a dead disabled button on every card.
      endSlot={
        <RematchRequestControl
          session={session}
          claimId={claim.claim.claim_entity_id}
          spaceId={claim.claim.space_id}
          chatPosition={chatPosition}
          localPosition={localPosition}
          remotePosition={remotePosition}
          opponentPresent={roomOpponentPresent}
          indexingDelayed={responseIndexing.status === 'delayed'}
          busy={busy}
          recentlyRejected={claim.recently_rejected}
          previouslyDebated={previouslyDebated}
          onRequest={onRequest}
        />
      }
      // The refusal stays in a full-width row rather than riding the control into the header. The
      // end slot cannot shrink — it holds a fixed-height pill beside the space chip — so a sentence
      // like "respond to this claim before requesting a rematch" would set its max-content width and
      // push the row wider than the card. geo-chat's refusals here are sentences, not the couple of
      // words the side panel's are, which is why that surface can keep its own inline.
      footer={
        context || requestError ? (
          <>
            {context}
            {requestError ? (
              <div role="alert" className="mt-2">
                <Text as="p" variant="footnote" color="red-01">
                  {requestError}
                </Text>
              </div>
            ) : null}
          </>
        ) : null
      }
      // `positions` locates the viewer by geo-chat user id, which is null until the token exchange
      // lands. Until then `chatPosition` reads as "no position" for someone the summaries
      // may already count, and the card would draw them onto a second side.
      viewerIdentityPending={currentUserId === null}
      // geo-chat has no row for this claim, which `readiness.viewer_response` below flattens to the
      // same `null` it uses for "no position". The card needs the difference: its sides here are the
      // graph's, and correcting them against an answer nobody gave takes the viewer off the side
      // the graph says they hold (GEO-2807).
      viewerResponseUnknown={chatPosition === undefined}
      // No second source for the viewer's side here. `viewerResponseUnknown` above covers geo-chat
      // having no row at all; this also covers a row reporting "no position", where filling the gap
      // from the indexed response would highlight a side the viewer has withdrawn while the footer
      // below — which reads `chatPosition` raw — went on refusing the request.
      reconcileWithIndexedResponse={false}
      // Reading a claim shouldn't cost the session: navigating to its entity page would leave the
      // rematch behind, so open it beside the picker instead.
      onOpenClaim={() =>
        openSidePanel(claim.claim.claim_entity_id, claim.claim.space_id, false, { forceRequestedSpace: true })
      }
    />
  );
}

/** A "From this debate" claim, and its picker row once the graph has it (GEO-2870). */
type FromThisDebateItem = { claim: FromThisDebateClaim; row: DebateRematchClaim | null };

/** How often the "From this debate" tab re-asks the graph for claims it does not have yet. */
const DEBATE_CLAIM_PUBLISH_POLL_MS = 15_000;

/** Which turn of the debate a claim came from, by its speaker. */
function DebateTurnCaption({ speaker }: { speaker: string | null }) {
  return (
    <Text as="p" variant="footnote" color="grey-04" className="mt-2">
      {speaker ? `Said by ${speaker}` : 'Said in this debate'}
    </Text>
  );
}

/**
 * A claim from the debate that the graph does not have yet (GEO-2870 phase 2).
 *
 * No position pills and no request: geo-chat resolves both against the graph and refuses an id it
 * cannot find, so either control would be a button that fails. It says when that changes instead.
 * The id is the one the publisher creates the claim under, so the same claim becomes a full card in
 * place once it is published — shortly after extraction, ahead of the debate (GEO-2870 option A).
 */
function UnpublishedDebateClaimCard({ claim, speaker }: { claim: FromThisDebateClaim; speaker: string | null }) {
  return (
    <motion.article
      {...hubCardMotion}
      data-testid="from-this-debate-unpublished"
      className="w-full claim-card-panel-surface"
    >
      <p className="claim-card-panel-title">{claim.text}</p>
      <DebateTurnCaption speaker={speaker} />
      <Text as="p" variant="footnote" color="grey-04">
        Publishing to Geo. You can take a side and request a debate on this in a minute or two.
      </Text>
    </motion.article>
  );
}

/** One curated block, collapsible so a long page of recommendations stays scannable. */
function RecommendedSection({
  name,
  count,
  defaultOpen = true,
  showCount = false,
  children,
}: {
  name: string;
  count: number;
  defaultOpen?: boolean;
  /** Draw the count beside the name. A closed section otherwise gives no hint of what is in it. */
  showCount?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
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
        {showCount ? (
          <span
            aria-hidden
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-grey-01 px-1.5 text-metadataMedium text-grey-04 tabular-nums"
          >
            {count}
          </span>
        ) : null}
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

/**
 * A tab's rows, split into the new ones and the ones the pair have already debated (GEO-3120).
 *
 * Split after each list's hold rather than inside its builder, so every hold, order and settling
 * rule above keeps seeing the whole list it always did, and the rows only part ways on the way out.
 */
function splitByDebated(rows: DebateRematchClaim[], isDebated: (claim: DebateRematchClaim) => boolean) {
  const fresh: DebateRematchClaim[] = [];
  const debated: DebateRematchClaim[] = [];
  for (const row of rows) (isDebated(row) ? debated : fresh).push(row);
  return { fresh, debated };
}

/** Both sides of a rematch claim, in the shape the shared card draws avatars from. */
function rematchPositionSummaries(
  claim: DebateRematchClaim,
  session: DebateRematchSession | null
): DebateClaimPositionSummary[] {
  return [true, false].map(position => {
    const holders = claim.participants.filter(side => side.position === position);
    const participants = holders
      .map(holder => session?.participants.find(participant => participant.user_id === holder.user_id))
      .filter((participant): participant is DebateRematchParticipant => participant !== undefined);

    return {
      position,
      // Our word, not the holder's — see `positionSummariesFromCounts`. This used to prefer a
      // server-supplied label so that an authoritative Verify/Dispute survived, which is exactly
      // what must not happen now.
      position_label: responsePositionLabel(position),
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

/**
 * The debates hub panel's tab, reused here (GEO-2992).
 *
 * Two surfaces that do the same job had two different tab treatments — a 1.4rem strip here, the
 * hub's `text-quoteMedium` row with an underlined active tab there. `tabGroupTabLinkStyles` is the
 * hub's, so this row now reads as the same control in a second place rather than as its own thing.
 */
/** One tab of the picker's strip (GEO-3148): its label, and its count where it has one. */
type PickerTabSpec = {
  id: PickerTab;
  label: string;
  count?: { value: number; pending: boolean; pendingLabel: string };
};

function TabButton({
  label,
  count,
  active,
  onClick,
}: Pick<PickerTabSpec, 'label' | 'count'> & { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Without a label a tab click reached the warehouse as a bare class list, so nobody could tell
      // which tab people picked (GEO-3148). The hub's tabs are labelled the same way.
      {...debateActionAnalyticsAttributes('rematch', `${label} tab`, 'navigate_debate_rematch')}
      // Read by `ScrollableTabRow` to bring the selected tab into view.
      data-tab-active={active ? 'true' : undefined}
      // `aria-pressed`, not `aria-selected`: these are plain buttons with no `role="tab"` and no
      // `tablist` around them, and `aria-selected` is not supported on a button — it was being
      // dropped, so nothing announced which tab was active.
      aria-pressed={active}
      // `shrink-0` so a narrow screen scrolls the strip rather than squeezing three tabs into the
      // width of one. The rest — `text-quoteMedium`, the active/inactive colours, `whitespace-nowrap`
      // — comes from the shared styles.
      className={cx(tabGroupTabLinkStyles({ active }), 'shrink-0')}
    >
      {label}
      {count ? (
        <TabCount count={count.value} pending={count.pending} active={active} pendingLabel={count.pendingLabel} />
      ) : null}
      {/* Drawn over the row's baseline rather than instead of it, so the marker and the hairline
          line up exactly. `bottom-[-8px]` is the strip's own `pb-2`, and `z-100` keeps it above the
          rule — the same marker the debates hub panel draws. */}
      {active ? <span aria-hidden className="absolute right-0 bottom-[-8px] left-0 z-100 h-px bg-text" /> : null}
    </button>
  );
}

/**
 * A tab's count. The badge keeps its size whether it holds a number or a skeleton, so the strip does
 * not reflow when the number lands — and a skeleton says "still counting", where `0` would say "none"
 * and usually be wrong (GEO-2656).
 *
 * `h-5`, not `min-h-6`: anything taller than the 22px label line makes the tab taller than its
 * neighbours, and the active marker is positioned from each tab's own bottom — so it would sit a
 * pixel below the rule every other tab's marker meets.
 */
function TabCount({
  count,
  pending,
  active,
  pendingLabel,
}: {
  count: number;
  pending: boolean;
  active: boolean;
  pendingLabel: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-metadataMedium tabular-nums',
        active ? 'bg-text text-white' : 'bg-grey-01 text-grey-04'
      )}
    >
      {pending ? <Skeleton radius="rounded-full" className="h-3 w-3" aria-label={pendingLabel} /> : count}
    </span>
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
