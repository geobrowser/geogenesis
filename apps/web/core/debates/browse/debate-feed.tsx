'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';

import { capture } from '~/core/analytics';
import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { type Debate, GeoChatRequestError } from '~/core/debates/api';
import type { DebatePageFeedState } from '~/core/debates/debate-page-outcome';
import { isRemovedDebateAnswer } from '~/core/debates/debate-removal';
import { useDebate, useProcessedVideoDebateIds, useSpaceDebates } from '~/core/debates/hooks';
import { isWatchableDebate } from '~/core/debates/playback-utils';
import { type DebatePageOutcome, useDebatePageOutcome } from '~/core/debates/use-debate-page-outcome';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useComments } from '~/core/hooks/use-comments';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { EntityCommentsPanel } from '~/partials/comments/entity-comments-panel';

import { DebateClaimsPanel } from './debate-claims-panel';
import { DebateFeedPlayer } from './debate-feed-player';
import { type DebateFeedSurface, debateFeedHref } from './debate-feed-url';
import { DebateInteractionBar } from './debate-interaction-bar';
import { DebateOverflowMenu } from './debate-overflow-menu';
import { DebateScrollHint, scrollHintBounceProps, useDebateScrollHint } from './debate-scroll-hint';
import { useLineClampOverflow } from './line-clamp-overflow';
import { DebateShareDialog } from './share-dialog';
import { useDebateShareAction } from './use-debate-share-action';
import { useDebatesBestOrder } from './use-debates-best-order';
import { debateFullscreenActiveAtom } from '~/atoms';

const PAGE_SIZE = 5;
/** How many cards past the active one open their recordings. See the `preload` prop below. */
const PRELOAD_AHEAD = 2;
const DEBATE_COLUMN_STYLE = {
  // Grow or shrink the media with the viewport while reserving the navbar,
  // claim title, media gap, and vertical breathing room.
  '--debate-feed-column-width': 'clamp(280px, min(calc(100cqw - 4rem), calc(82.9dvh - 10.88rem)), 640px)',
} as React.CSSProperties;

export function DebatesBrowseFeed({
  spaceId,
  initialDebateId,
  initialSeekSeconds = null,
  fallback,
  removedView,
  surface = initialDebateId ? 'debate-page' : 'debates-tab',
}: {
  spaceId: string;
  initialDebateId?: string;
  /**
   * Where to start the anchored debate, in seconds — from a link that named a moment.
   *
   * Only ever applied to {@link initialDebateId}: a position means nothing on the debates that
   * happen to be scrolled to next, and carrying it down the feed would seek every card a reader
   * passes. See `debate-timecode.ts` for the param this comes from.
   */
  initialSeekSeconds?: number | null;
  /** Rendered instead of the feed when {@link initialDebateId} can't be resolved in this space. */
  fallback?: React.ReactNode;
  /**
   * Rendered instead of {@link fallback} when geo-chat says the anchored debate was removed
   * (GEO-2785). The entity page usually learns that on the server and never mounts the feed, but a
   * debate removed after the page rendered — or while the server-side check failed open — lands
   * here, and the plain entity page is the one thing a removed debate must not fall back to.
   */
  removedView?: React.ReactNode;
  /**
   * Where the feed is mounted, so the URL can follow the debate on screen. See
   * {@link DebateFeedSurface}. Defaults to the debate page when anchored, the tab when not — the
   * tab passes it explicitly, since it anchors too when its URL names a debate.
   */
  surface?: DebateFeedSurface;
}) {
  const debatesQuery = useSpaceDebates(spaceId, true);
  // The visit's outcome is about a debate's own page. The tab anchors too when reloaded on a
  // `?debate=` URL, but that is still a visit to the tab.
  const pageOutcome = useDebatePageOutcome(surface === 'debate-page' ? initialDebateId : undefined);
  const { space } = useSpace(spaceId);

  const listedDebates = React.useMemo(() => debatesQuery.data?.debates ?? [], [debatesQuery.data?.debates]);

  // GEO-2764. The space listing is capped — `list_space_debates` is `LIMIT 50` with no pagination
  // and no way to ask for one specific debate — so a perfectly watchable debate can simply be past
  // the window and absent from it. Resolving the anchor from that listing therefore fails for
  // reasons that have nothing to do with the debate: the AI space sits at exactly 50 today, and a
  // viewer who participated in any incomplete debate there pushes their own count over and loses
  // the oldest few. The next completed debate in that space tips it for everyone at once.
  //
  // So fetch the anchor by id instead of requiring it to appear. Gated on the listing having
  // settled without it, which keeps the common case at one request — this only fires where the
  // feed would otherwise have silently rendered the wrong page.
  const anchorListed = initialDebateId != null && listedDebates.some(debate => ID.equals(debate.id, initialDebateId));
  const anchorQuery = useDebate(
    initialDebateId ?? '',
    initialDebateId != null && !debatesQuery.isLoading && !anchorListed
  );

  // Two-stage gate (GEO-2412). `isWatchableDebate` only proves both raw recordings exist; a debate
  // whose media job failed or never ran still passes it, so readiness decides what renders.
  //
  // The directly-fetched anchor goes through the same gate as everything else — being navigated to
  // is not a reason to play a debate that has no video.
  const candidates = React.useMemo(() => {
    const watchable = listedDebates.filter(isWatchableDebate);
    const anchor = anchorQuery.data;
    if (!anchor || !isWatchableDebate(anchor)) return watchable;
    if (watchable.some(debate => ID.equals(debate.id, anchor.id))) return watchable;
    return [...watchable, anchor];
  }, [listedDebates, anchorQuery.data]);
  const candidateIds = React.useMemo(() => candidates.map(debate => debate.id), [candidates]);
  const {
    processedIds,
    isLoading: mediaLoading,
    hasError: mediaError,
  } = useProcessedVideoDebateIds(candidateIds, candidateIds.length > 0);

  // The same ranking the explore page's "Best" sort uses, so what plays after the debate you
  // opened is what that sort would have put in front of you.
  const { rankByDebateId, isLoading: bestOrderLoading } = useDebatesBestOrder(spaceId, candidateIds.length > 0);

  // Every debate the viewer has reached, plus the ones already preloading after it, in the order they
  // were shown. Nothing may be inserted above or among them.
  //
  // The feed is a mandatory snap container, and browsers keep it snapped to the *element* it was on
  // when content changes around it. So a debate slotted in above the one on screen does not push the
  // viewer's card down — it drags the scroll position down with it, and the viewer is carried past
  // debates they never saw. The readiness lookups resolve one at a time and each can rank anywhere,
  // so on a slow connection a feed opened at the top ended up a dozen cards down within seconds. A
  // listing refetch that adds a debate does the same at any time. Below the pinned run the order is
  // still free to settle: nothing there is on screen.
  const [pinnedIds, setPinnedIds] = React.useState<readonly string[]>([]);

  const rankedDebates = React.useMemo(() => {
    // Held back the way the media lookups hold it back — by having nothing to show yet rather than
    // by a flag, since the flag below only drives the empty and anchor states. Painting in recency
    // order first would move the next debate out from under someone already scrolling. A ranking
    // that fails rather than loads leaves this empty, so the feed falls through to recency.
    if (bestOrderLoading) return [];

    const processed = new Set(processedIds);
    // Recency is the tiebreak, not the rule: the ranking covers published, named debates, so
    // anything it hasn't scored still plays — after the ranked ones, newest first, exactly as the
    // whole feed used to be ordered.
    const rankOf = (debate: Debate) => rankByDebateId.get(ID.uuidToHex(debate.id)) ?? Number.MAX_SAFE_INTEGER;
    const sorted = candidates
      .filter(debate => processed.has(debate.id))
      .sort((a, b) => rankOf(a) - rankOf(b) || completedTime(b) - completedTime(a));
    if (!initialDebateId) return sorted;
    // Navigating to a Debate entity lands you on that debate: hoist it to the top so it's the
    // first full-screen video, then let the rest of the space's debates scroll in below it.
    const anchorIndex = sorted.findIndex(debate => ID.equals(debate.id, initialDebateId));
    if (anchorIndex <= 0) return sorted;
    const [anchor] = sorted.splice(anchorIndex, 1);
    return [anchor, ...sorted];
  }, [candidates, processedIds, initialDebateId, rankByDebateId, bestOrderLoading]);

  const { debates, pinnedCount } = React.useMemo(() => {
    if (pinnedIds.length === 0) return { debates: rankedDebates, pinnedCount: 0 };
    const byId = new Map(rankedDebates.map(debate => [debate.id, debate]));
    // A pinned debate that has left the listing goes: there is nothing left to play. It stops
    // counting as pinned too, or the run would stall short of the viewer — see the pin effect.
    const pinned = pinnedIds.flatMap(id => byId.get(id) ?? []);
    const pinnedSet = new Set(pinned.map(debate => debate.id));
    return {
      debates: [...pinned, ...rankedDebates.filter(debate => !pinnedSet.has(debate.id))],
      pinnedCount: pinned.length,
    };
  }, [rankedDebates, pinnedIds]);

  // Topics live on the claim entity (not the debates API), so resolve them once
  // for the space and map claim entity id -> topic names.
  const { entities: claims } = useQueryEntities({
    where: {
      spaces: [{ equals: spaceId }],
      types: [{ id: { equals: CLAIM_TYPE_ID } }],
    },
    first: 50,
    placeholderData: keepPreviousData,
    includeUnpublishedLocal: true,
  });
  const topicsByClaimId = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const claim of claims) {
      const topics = claim.relations
        .filter(relation => relation.type.id === TOPICS_PROPERTY_ID && relation.isDeleted !== true)
        .map(relation => relation.toEntity.name ?? relation.toEntity.id);
      if (topics.length > 0) map.set(claim.id, topics);
    }
    return map;
  }, [claims]);

  // State-backed so children re-render once the scroll container mounts and can
  // observe against it as their IntersectionObserver root — a plain ref would
  // leave them with the initial null (i.e. the viewport).
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);
  // An anchored feed starts active on the anchor so the linked debate is the one
  // that autoplays, before any IntersectionObserver has fired.
  const [activeId, setActiveId] = React.useState<string | null>(initialDebateId ?? null);
  const lastObservedDebate = React.useRef<string | null>(null);
  const lastScrollIntent = React.useRef(-Infinity);
  const activateVisibleDebate = (debateId: string) => {
    setActiveId(debateId);
    if (initialDebateId != null && !ID.equals(debateId, initialDebateId)) pageOutcome?.movedOn();
    if (lastObservedDebate.current === debateId) return;
    const previousDebateId = lastObservedDebate.current;
    lastObservedDebate.current = debateId;
    try {
      capture('debate_navigation', {
        measurement_version: 'growth-v2',
        debate_id: debateId,
        previous_debate_id: previousDebateId,
        navigation_id: crypto.randomUUID(),
        trigger: performance.now() - lastScrollIntent.current < 2000 ? 'manual' : 'unknown',
        navigation_surface: 'debate_feed',
      });
    } catch {
      /* Navigation must work without analytics. */
    }
  };
  // Which panel is open, not which debate it was opened from: the claims and
  // comments panels describe the debate you're watching, so they follow the feed
  // as you scroll rather than staying pinned to the one whose button you pressed.
  const [openPanel, setOpenPanel] = React.useState<'claims' | 'comments' | null>(null);

  // The media lookups gate rendering, so the feed is still loading until they settle — otherwise it
  // flashes "no debates" and strands a valid anchor.
  // Waiting on the ranking too, so the feed doesn't paint in recency order and then resequence
  // itself underneath someone who has already started scrolling.
  // `anchorQuery` is part of the load: without it the feed reaches `anchorMissing` while the
  // direct fetch is still in flight and falls back anyway, which is the bug.
  const isLoading = debatesQuery.isLoading || anchorQuery.isLoading || mediaLoading || bestOrderLoading;

  const anchorPresent = React.useMemo(
    () => initialDebateId == null || debates.some(debate => ID.equals(debate.id, initialDebateId)),
    [debates, initialDebateId]
  );

  const anchorUnresolved = initialDebateId != null && !anchorPresent;

  // A 404 is the exception to the rule below: it is a definitive answer, not a failed lookup. The
  // debate is not there -- it never existed, or it has been hidden (GEO-2785, which makes every
  // by-id route read as absent). Treating that as "unknown" would hold the feed on an error state
  // for a debate that is deliberately gone, so it falls through to `anchorMissing` and the
  // caller's fallback view instead.
  const anchorGone = anchorQuery.error instanceof GeoChatRequestError && anchorQuery.error.status === 404;
  // Of those, the one that means "removed": geo-chat's own `debate_not_found` for an id it minted.
  const anchorRemoved =
    anchorGone &&
    initialDebateId != null &&
    anchorQuery.error instanceof GeoChatRequestError &&
    isRemovedDebateAnswer(initialDebateId, anchorQuery.error.status, anchorQuery.error.code);

  // An anchor absent after a failed lookup is *unknown*, not missing: falling
  // back would misread a transient readiness/query error as "this debate has no
  // video", so the feed stays up and shows its own error state instead.
  const anchorErrored =
    anchorUnresolved &&
    !isLoading &&
    !anchorGone &&
    (mediaError || debatesQuery.error != null || anchorQuery.error != null);

  // Hold an anchored feed until the anchor itself is ready: the per-debate
  // readiness lookups resolve one at a time, so painting the partial list would
  // open the feed on whichever debate resolved first and then reorder underneath
  // the viewer once the anchor's lookup lands — landing them on the wrong video.
  // Only the anchor's own readiness gates; other debates may still be resolving.
  // The same hold applies while errored — the anchor can't render, and starting
  // the feed on some other debate is exactly the wrong-video landing.
  const anchorPending = anchorUnresolved && (isLoading || anchorErrored);

  // One message at a time, most specific first. A readiness lookup that failed has to read as an
  // error, not "none yet" — the debate list itself loaded fine, so its own error state can't say so.
  const emptyMessage = isLoading
    ? 'Loading debates…'
    : debatesQuery.error instanceof Error
      ? `Could not load debates: ${debatesQuery.error.message}`
      : mediaError
        ? 'Could not check which debates are ready to watch. Try again shortly.'
        : 'No debates to watch yet. Start one from the Claims tab.';

  // Anchored to a debate that isn't in this space's feed (space not registered for debates, or the
  // debate isn't watchable)? Fall back to the caller's view instead of stranding the visitor on the
  // feed's "space not found" error. Only applies when a fallback is supplied (the entity page); the
  // Debates tab passes none and keeps its own empty/error states. Requires a clean read — an
  // errored lookup holds the feed's error state above rather than falling back.
  const anchorMissing = anchorUnresolved && !isLoading && !anchorErrored;

  // Tell the app shell it's hosting a viewport-filling takeover, so a Debate entity page —
  // whose route `Main` can't recognise as full-width — drops its page chrome. Not set on the
  // fallback path, where an ordinary entity page renders and does want that chrome. A layout
  // effect so the padded layout is never painted, only to snap away a frame later.
  const showsRemovedView = anchorMissing && anchorRemoved && removedView != null;
  const rendersFeed = !(anchorMissing && fallback != null) && !showsRemovedView;
  const setDebateFullscreenActive = useSetAtom(debateFullscreenActiveAtom);
  React.useLayoutEffect(() => {
    if (!rendersFeed) return;
    setDebateFullscreenActive(true);
    return () => setDebateFullscreenActive(false);
  }, [rendersFeed, setDebateFullscreenActive]);

  // An unanchored feed has nothing fixed at the top, so its first paint has to be its final order:
  // painting whichever debates' readiness came back first, then ranking the rest in above them, is
  // the drift described at `pinnedIds`. Only until something is pinned — after that the order on
  // screen is held by the pin, and a later lookup (a refetch adding a debate) must not blank it.
  const orderPending = initialDebateId == null && mediaLoading && pinnedIds.length === 0;

  // Memoised because both branches build a new array: the effect below is keyed on this, and an
  // unmemoised ternary re-ran it on every render.
  const visibleDebates = React.useMemo(
    () => (anchorPending || orderPending ? [] : debates.slice(0, visibleCount)),
    [anchorPending, orderPending, debates, visibleCount]
  );

  // Gated on what's actually on screen rather than on `debates`: that inherits the anchor
  // hold above, and holds the nudge back while the media lookups land one at a time and
  // the list re-sorts underneath the viewer. Nothing to nudge toward with one debate.
  const scrollHint = useDebateScrollHint(!isLoading && visibleDebates.length > 1);

  // Keep an active debate whenever the list is non-empty — including when a
  // refetch, pagination, or space switch drops the current activeId out of view,
  // which would otherwise leave nothing active or autoplaying. While the anchor
  // is pending nothing renders, so don't let a partial list steal the anchor's
  // active slot before it appears.
  React.useEffect(() => {
    if (visibleDebates.length === 0) return;
    if (!activeId || !visibleDebates.some(debate => debate.id === activeId)) {
      setActiveId(visibleDebates[0].id);
    }
  }, [activeId, visibleDebates]);

  // Which debate the viewer is on, so the one after it can preload its recordings.
  // -1 when nothing is active yet, which preloads nothing rather than the first item.
  const activeIndex = visibleDebates.findIndex(debate => debate.id === activeId);

  // Pin through the active card and the ones preloading after it. Only ever grows, and only as the
  // viewer moves on — what follows the pinned run is still the live ranking. See `pinnedIds`.
  // Capped at what is rendered, or a feed shorter than the window would re-pin forever.
  const pinThrough = activeIndex < 0 ? 0 : Math.min(activeIndex + PRELOAD_AHEAD + 1, visibleDebates.length);
  // Compared with the pins still in the listing, not every id ever pinned: debates that dropped out
  // would otherwise count towards a run that no longer covers the cards they were holding. Rebuilt
  // from what is on screen, so those ids are compacted away as it extends.
  React.useEffect(() => {
    if (pinThrough <= pinnedCount) return;
    setPinnedIds(visibleDebates.slice(0, pinThrough).map(debate => debate.id));
  }, [pinThrough, pinnedCount, visibleDebates]);

  // The URL follows the debate on screen, the way a short-video feed's does: reloading, copying the
  // address bar, or coming Back lands on what was being watched rather than on whichever debate the
  // feed was opened at. `replaceState`, not a push, so Back leaves the feed instead of stepping back
  // through every debate scrolled past. Next keeps its router in step with direct history calls
  // without navigating, so nothing remounts.
  React.useEffect(() => {
    if (!activeId || !rendersFeed) return;
    const href = debateFeedHref(window.location, { surface, spaceId, debateId: activeId });
    if (href == null) return;
    window.history.replaceState(null, '', href);
  }, [activeId, rendersFeed, spaceId, surface]);

  // Where the linked debate has got to, for the visit's outcome, in the same order the render
  // below decides what to show.
  const anchorSource =
    listedDebates.find(debate => initialDebateId != null && ID.equals(debate.id, initialDebateId)) ?? anchorQuery.data;
  const pageFeedState: DebatePageFeedState = anchorMissing
    ? {
        kind: 'unavailable',
        detail: anchorRemoved
          ? 'removed'
          : anchorGone || !anchorSource
            ? 'not_found'
            : !isWatchableDebate(anchorSource)
              ? 'not_watchable'
              : 'not_processed',
      }
    : anchorErrored
      ? { kind: 'lookup_error' }
      : anchorUnresolved
        ? {
            kind: 'loading',
            stage: debatesQuery.isLoading
              ? 'debate_list'
              : anchorQuery.isLoading
                ? 'anchor_lookup'
                : mediaLoading
                  ? 'media_readiness'
                  : 'ranking',
          }
        : { kind: 'shown' };
  // Keyed on its content, so it reports a change of state rather than every render.
  const pageFeedStateKey = JSON.stringify(pageFeedState);
  const latestPageFeedState = React.useRef(pageFeedState);
  latestPageFeedState.current = pageFeedState;
  React.useEffect(() => {
    pageOutcome?.feed(latestPageFeedState.current);
  }, [pageOutcome, pageFeedStateKey]);

  // Runs after all hooks so the early return never skips one.
  if (showsRemovedView) {
    return <>{removedView}</>;
  }
  if (anchorMissing && fallback != null) {
    return <>{fallback}</>;
  }

  const feed = (
    <div
      ref={setScrollEl}
      onWheel={() => {
        lastScrollIntent.current = performance.now();
      }}
      onTouchMove={() => {
        lastScrollIntent.current = performance.now();
      }}
      onKeyDown={event => {
        if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '].includes(event.key))
          lastScrollIntent.current = performance.now();
      }}
      className="no-scrollbar [container-type:inline-size] h-[calc(100dvh-2.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth md:h-dvh"
    >
      {visibleDebates.length === 0 && <FeedMessage>{emptyMessage}</FeedMessage>}
      {visibleDebates.map((debate, index) => (
        <DebateFeedItem
          key={debate.id}
          debate={debate}
          spaceId={spaceId}
          spaceName={space?.entity.name ?? 'Space'}
          spaceImage={space?.entity.image}
          topics={topicsByClaimId.get(debate.claim.claim_entity_id) ?? []}
          active={activeId === debate.id}
          initialSeekSeconds={
            initialDebateId != null && ID.equals(debate.id, initialDebateId) ? initialSeekSeconds : null
          }
          // Only the linked debate's card reports: the visit's outcome is about that debate.
          onPlaybackState={
            initialDebateId != null && ID.equals(debate.id, initialDebateId) ? pageOutcome?.player : undefined
          }
          // Resolve the next debates' recordings while the viewer is still on this one. Each
          // debate needs two signed URLs, and until they land the player shows "Loading…"
          // instead of a video, which is what makes arriving at a card feel glitchy
          // (GEO-2895).
          //
          // Two ahead for the URLs and headers, one ahead for the data (GEO-2965). The active
          // card now waits until both of its recordings can play, so a card reached cold is a
          // card that waits — and a quick double swipe used to land exactly there, on a card
          // nothing had opened. Headers are cheap; buffering is not, so only the very next card
          // buffers, and nothing further than two ahead is touched at all.
          preload={activeIndex >= 0 && index > activeIndex && index <= activeIndex + PRELOAD_AHEAD}
          buffer={activeIndex >= 0 && index === activeIndex + 1}
          // Cards stay mounted as the feed grows, so everything outside one behind to the preload
          // window ahead releases its <video> elements (GEO-3067).
          // With no active card (a refetch dropped it), everything stays released until one is chosen.
          releaseMedia={activeIndex < 0 || index < activeIndex - 1 || index > activeIndex + PRELOAD_AHEAD}
          root={scrollEl}
          // Only the debate the viewer is looking at carries the nudge and lifts with it.
          scrollHint={index === 0 ? scrollHint : null}
          onActivate={() => activateVisibleDebate(debate.id)}
          // Pressing a debate's own control makes it the active one rather than
          // waiting for the scroll observer: its bar is reachable from 0%
          // visibility but activation needs 60%, so mid-scroll the panel would
          // otherwise open on the debate being scrolled away from.
          onOpenClaims={() => {
            setActiveId(debate.id);
            setOpenPanel('claims');
          }}
          onOpenComments={() => {
            setActiveId(debate.id);
            setOpenPanel('comments');
          }}
          onPlaybackRequest={() => setActiveId(debate.id)}
        />
      ))}
      {!anchorPending && !orderPending && visibleCount < debates.length && (
        <LoadMoreSentinel root={scrollEl} onLoadMore={() => setVisibleCount(count => count + PAGE_SIZE)} />
      )}
    </div>
  );

  const activeDebate = visibleDebates.find(debate => debate.id === activeId) ?? null;
  const closePanel = () => setOpenPanel(null);

  const sidePanel =
    openPanel === 'claims' && activeDebate ? (
      <DebateClaimsPanel
        // Keyed, like the comments panel below, so scrolling to the next debate resets the panel —
        // its scroll position belongs to the debate it was set on, and a reused panel carried the
        // old offset onto the next one.
        key={activeDebate.id}
        debate={activeDebate}
        onClose={closePanel}
      />
    ) : openPanel === 'comments' && activeDebate ? (
      // Keyed so scrolling to the next debate resets the panel rather than
      // carrying a half-typed reply across to a different debate's thread.
      <EntityCommentsPanel
        key={activeDebate.id}
        entityId={activeDebate.id}
        spaceId={spaceId}
        targetEntityType="debate"
        onClose={closePanel}
      />
    ) : null;

  // Keep the feed in the same tree position whether or not a side panel is open, so
  // toggling the claims/comments panel doesn't remount the players and restart playback.
  return (
    <div className="flex h-[calc(100dvh-2.75rem)] items-stretch md:fixed md:inset-0 md:z-[70] md:h-dvh md:bg-white">
      <div className="min-w-0 flex-1">{feed}</div>
      {sidePanel}
    </div>
  );
}

function DebateFeedItem({
  debate,
  spaceId,
  spaceName,
  spaceImage,
  topics,
  active,
  initialSeekSeconds,
  preload,
  buffer,
  releaseMedia,
  root,
  scrollHint,
  onActivate,
  onOpenClaims,
  onOpenComments,
  onPlaybackRequest,
  onPlaybackState,
}: {
  debate: Debate;
  spaceId: string;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
  active: boolean;
  initialSeekSeconds: number | null;
  preload: boolean;
  /** Buffer the recordings too — the card after the active one. See `DebateFeedPlayer`. */
  buffer: boolean;
  releaseMedia: boolean;
  root: HTMLElement | null;
  scrollHint: { isVisible: boolean; isLeaving: boolean } | null;
  onActivate: () => void;
  onOpenClaims: () => void;
  onOpenComments: () => void;
  /** Replay on a debate that is not the active one makes it the active one, like its other controls. */
  onPlaybackRequest: () => void;
  onPlaybackState?: DebatePageOutcome['player'];
}) {
  const itemRef = React.useRef<HTMLElement | null>(null);
  const share = useDebateShareAction();
  // Comments live on the Debate entity — same query key as the panel, so posting
  // there updates this count without a refetch of our own.
  // Same arguments as the Comments panel's own useComments, so the two share a
  // cache entry and posting there updates this count without a refetch.
  const { totalCount: commentCount } = useComments({ entityId: debate.id, spaceId });
  // Same query key as the Claims panel's own hook, for the same reason as comments above: the
  // badge and the panel share one cache entry, so opening the panel doesn't refetch.
  const { claims } = useDebateTranscriptClaims(debate.id, debate.claim.space_id);

  React.useEffect(() => {
    const element = itemRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) onActivate();
        }
      },
      { root, threshold: [0.6] }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onActivate, root]);

  const interactionProps = {
    entityId: debate.id,
    spaceId,
    commentCount,
    claimsCount: claims.totalCount,
    onComment: onOpenComments,
    onClaims: () => onOpenClaims(),
    onShare: share.onOpen,
    shareOpen: share.open,
  };

  return (
    <section
      ref={itemRef}
      // 20px below the navbar, per the design — the media sizing has slack to absorb it, so
      // the claim header doesn't need to sit flush against the chrome. `md:py-3` still wins on
      // mobile: Tailwind emits variant utilities after unprefixed ones, so no `md:pt-3` needed.
      className="flex h-full snap-start items-start justify-center px-4 pt-5 md:h-auto md:min-h-full md:px-2 md:py-3"
    >
      {/* The whole debate lifts with the nudge — title, media and controls together — so the
          gesture reads as the feed scrolling rather than as one element twitching. Shared
          animation props keep the card and the indicator in step. */}
      <div
        className={cx('flex items-stretch gap-3', scrollHint?.isVisible && scrollHintBounceProps.className)}
        style={scrollHint?.isVisible ? scrollHintBounceProps.style : undefined}
      >
        <div
          className="relative flex w-[var(--debate-feed-column-width)] min-w-0 flex-col md:w-[calc(100vw-1rem)]"
          style={DEBATE_COLUMN_STYLE}
        >
          <div className="md:mt-4">
            <DebateTitleHeader
              key={debate.claim.claim}
              claim={debate.claim.claim}
              claimEntityId={debate.claim.claim_entity_id}
              spaceId={spaceId}
              spaceName={spaceName}
              spaceImage={spaceImage}
              topics={topics}
            />
          </div>
          <div className="mt-6 md:mt-7">
            <DebateFeedPlayer
              debate={debate}
              active={active}
              preload={preload}
              buffer={buffer}
              releaseMedia={releaseMedia}
              initialSeekSeconds={initialSeekSeconds}
              onOpenClaims={onOpenClaims}
              onPlaybackRequest={onPlaybackRequest}
              onPlaybackState={onPlaybackState}
            />
          </div>
          {/* Mobile: horizontal bar below the videos. Wrapper controls display so
              it doesn't collide with the bar's own `flex`. */}
          <div className="mt-3 hidden md:block">
            <DebateInteractionBar
              orientation="horizontal"
              {...interactionProps}
              overflow={<DebateOverflowMenu debate={debate} variant="pill" />}
            />
          </div>
          {/* `top-full` hangs it just below the debate without taking part in the column's
              height, which the media sizing has no room to spare for. */}
          {scrollHint?.isVisible && (
            <DebateScrollHint leaving={scrollHint.isLeaving} className="absolute inset-x-0 top-full mt-4" />
          )}
        </div>
        {/* Desktop: vertical rail to the right of the videos. */}
        <div className="flex flex-col justify-end md:hidden">
          <DebateInteractionBar
            orientation="vertical"
            {...interactionProps}
            overflow={<DebateOverflowMenu debate={debate} variant="circle" />}
          />
        </div>
      </div>
      <DebateShareDialog
        open={share.open}
        onOpenChange={share.onOpenChange}
        debate={debate}
        spaceId={spaceId}
        openerRef={share.openerRef}
      />
    </section>
  );
}

/**
 * Lines the claim title shows before it offers to expand.
 *
 * Must agree with the `line-clamp-2` literal on the heading below — Tailwind only emits classes it
 * can read as literals, so the class cannot be built from this and the two are kept together
 * instead. If one changes, change both.
 */
const CLAIM_CLAMP_LINES = 2;

function DebateTitleHeader({
  claim,
  claimEntityId,
  spaceId,
  spaceName,
  spaceImage,
  topics,
}: {
  claim: string;
  claimEntityId: string;
  spaceId: string;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
}) {
  const [claimElement, setClaimElement] = React.useState<HTMLHeadingElement | null>(null);
  const [isClaimExpanded, setIsClaimExpanded] = React.useState(false);

  React.useEffect(() => setIsClaimExpanded(false), [claim]);

  const isClaimOverflowing = useLineClampOverflow(claimElement, {
    maxLines: CLAIM_CLAMP_LINES,
    enabled: !isClaimExpanded,
    contentKey: claim,
  });

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* `min-w-0` again on the anchor: the truncation chain runs parent → anchor → text, and
              a link left at its default `min-width: auto` would refuse to shrink and push the
              topics off the row instead of ellipsing the name. */}
          <Link href={NavUtils.toSpace(spaceId)} className="flex min-w-0 items-center gap-1.5 hover:underline">
            <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-grey-02">
              <Avatar avatarUrl={spaceImage} value={spaceName} size={16} />
            </span>
            <Text as="span" variant="metadata" color="text" className="truncate !leading-[13px] !tracking-[-0.35px]">
              {spaceName}
            </Text>
          </Link>
          {topics.map(topic => (
            <React.Fragment key={topic}>
              <Text as="span" variant="metadata" color="grey-04" className="!leading-[13px] !tracking-[-0.35px]">
                ·
              </Text>
              <Text
                as="span"
                variant="metadata"
                color="grey-04"
                className="truncate !leading-[13px] !tracking-[-0.35px]"
              >
                {topic}
              </Text>
            </React.Fragment>
          ))}
        </div>
      </div>
      <h2
        ref={setClaimElement}
        title={isClaimOverflowing ? claim : undefined}
        className={`text-cardEntityTitle !text-[22.4px] !leading-[21px] !tracking-[-0.672px] text-text md:!text-[24px] md:!leading-6 md:!tracking-[-0.75px] ${
          isClaimExpanded ? 'line-clamp-2 md:line-clamp-none' : 'line-clamp-2'
        }`}
      >
        <Link
          href={NavUtils.toEntity(spaceId, claimEntityId)}
          entityId={claimEntityId}
          spaceId={spaceId}
          className="hover:underline"
        >
          {claim}
        </Link>
      </h2>
      {isClaimOverflowing && (
        <button
          type="button"
          aria-expanded={isClaimExpanded}
          onClick={() => setIsClaimExpanded(expanded => !expanded)}
          className="hidden self-start text-[16px] leading-5 text-grey-04 underline-offset-2 hover:underline md:inline-flex"
        >
          {isClaimExpanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function LoadMoreSentinel({ root, onLoadMore }: { root: HTMLElement | null; onLoadMore: () => void }) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) onLoadMore();
      },
      { root, rootMargin: '200px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [onLoadMore, root]);
  return <div ref={ref} className="h-4" aria-hidden="true" />;
}

function FeedMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Text color="grey-04">{children}</Text>
    </div>
  );
}

function completedTime(debate: Debate) {
  const value = debate.completed_at ?? debate.started_at ?? debate.created_at;
  return value ? new Date(value).getTime() : 0;
}
