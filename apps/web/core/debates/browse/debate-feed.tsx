'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Debate } from '~/core/debates/api';
import { useDebate, useProcessedVideoDebateIds, useSpaceDebates } from '~/core/debates/hooks';
import { useGeoChatAuth } from '~/core/debates/hooks';
import { useDebatesHub } from '~/core/debates/matchmaking/use-debates-hub';
import { isWatchableDebate } from '~/core/debates/playback-utils';
import { useDebateTranscriptClaims } from '~/core/debates/use-debate-transcript-claims';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { useComments } from '~/core/hooks/use-comments';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';
import { NavUtils } from '~/core/utils/utils';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Text } from '~/design-system/text';

import { EntityCommentsPanel } from '~/partials/comments/entity-comments-panel';

import { DebateClaimsPanel } from './debate-claims-panel';
import { DebateFeedPlayer } from './debate-feed-player';
import { DebateInteractionBar } from './debate-interaction-bar';
import { DebateScrollHint, scrollHintBounceProps, useDebateScrollHint } from './debate-scroll-hint';
import { exceedsLineClamp } from './line-clamp-overflow';
import { useDebateShareAction } from './use-debate-share-action';
import { useDebatesBestOrder } from './use-debates-best-order';
import { debateFullscreenActiveAtom } from '~/atoms';

const PAGE_SIZE = 5;
const DEBATE_COLUMN_STYLE = {
  // Grow or shrink the media with the viewport while reserving the navbar,
  // claim title, media gap, and vertical breathing room.
  '--debate-feed-column-width': 'clamp(280px, min(calc(100cqw - 4rem), calc(82.9dvh - 10.88rem)), 640px)',
} as React.CSSProperties;

export function DebatesBrowseFeed({
  spaceId,
  initialDebateId,
  fallback,
}: {
  spaceId: string;
  initialDebateId?: string;
  /** Rendered instead of the feed when {@link initialDebateId} can't be resolved in this space. */
  fallback?: React.ReactNode;
}) {
  const debatesQuery = useSpaceDebates(spaceId, true);
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
  const anchorListed =
    initialDebateId != null && listedDebates.some(debate => ID.equals(debate.id, initialDebateId));
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

  const debates = React.useMemo(() => {
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
  // Which panel is open, not which debate it was opened from: the claims and
  // comments panels describe the debate you're watching, so they follow the feed
  // as you scroll rather than staying pinned to the one whose button you pressed.
  const [openPanel, setOpenPanel] = React.useState<'claims' | 'comments' | null>(null);
  // "Join a debate" opens the shared hub rather than a panel of this space's claims: the hub is
  // cross-space and carries the search, filters, counts and ranking the feed's own panel never had.
  const debatesHub = useDebatesHub();
  // Carry the intent across the login: signing in is a detour the viewer did not ask for, so
  // finish what they pressed rather than returning them to the feed to press it again.
  const openPrivySignIn = usePrivySignIn(() => {
    setOpenPanel(null);
    debatesHub.open('claims');
  });
  // Privy, not the smart account: `useSmartAccount` reports null while the account is restoring
  // and after an initialization failure as well as when nobody is signed in, and sending a
  // signed-in viewer back through login would wipe their half-finished onboarding.
  const { ready: authReady, authenticated } = useGeoChatAuth();

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

  // An anchor absent after a failed lookup is *unknown*, not missing: falling
  // back would misread a transient readiness/query error as "this debate has no
  // video", so the feed stays up and shows its own error state instead.
  const anchorErrored =
    anchorUnresolved && !isLoading && (mediaError || debatesQuery.error != null || anchorQuery.error != null);

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
  const rendersFeed = !(anchorMissing && fallback != null);
  const setDebateFullscreenActive = useSetAtom(debateFullscreenActiveAtom);
  React.useLayoutEffect(() => {
    if (!rendersFeed) return;
    setDebateFullscreenActive(true);
    return () => setDebateFullscreenActive(false);
  }, [rendersFeed, setDebateFullscreenActive]);

  const visibleDebates = anchorPending ? [] : debates.slice(0, visibleCount);

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

  // Runs after all hooks so the early return never skips one.
  if (anchorMissing && fallback != null) {
    return <>{fallback}</>;
  }

  const feed = (
    <div
      ref={setScrollEl}
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
          root={scrollEl}
          // Only the debate the viewer is looking at carries the nudge and lifts with it.
          scrollHint={index === 0 ? scrollHint : null}
          onActivate={() => setActiveId(debate.id)}
          // Pressing a debate's own control makes it the active one rather than
          // waiting for the scroll observer: its bar is reachable from 0%
          // visibility but activation needs 60%, so mid-scroll the panel would
          // otherwise open on the debate being scrolled away from.
          onOpenJoin={() => {
            setActiveId(debate.id);
            // Decide nothing until Privy has restored the session: a press in that window is a
            // no-op rather than a wrong answer in either direction.
            if (!authReady) return;
            // Everything the hub offers — taking a position, standing ready, requesting a debate —
            // needs an account, so a signed-out viewer gets the same login voting gives them
            // rather than a panel whose every control refuses them.
            if (!authenticated) {
              openPrivySignIn();
              return;
            }
            // A second press closes it, the way the navbar's debate button behaves. Without this
            // the button is a one-way door and the only way out is the panel's own close control.
            if (debatesHub.isOpen) {
              debatesHub.close();
              return;
            }
            // The hub is its own portal, so the feed's panel state stays out of it. Closing the
            // in-flow panel first keeps the two from stacking over the same feed.
            setOpenPanel(null);
            debatesHub.open('claims');
          }}
          onOpenClaims={() => {
            setActiveId(debate.id);
            setOpenPanel('claims');
          }}
          onOpenComments={() => {
            setActiveId(debate.id);
            setOpenPanel('comments');
          }}
        />
      ))}
      {!anchorPending && visibleCount < debates.length && (
        <LoadMoreSentinel root={scrollEl} onLoadMore={() => setVisibleCount(count => count + PAGE_SIZE)} />
      )}
    </div>
  );

  const activeDebate = visibleDebates.find(debate => debate.id === activeId) ?? null;
  const closePanel = () => setOpenPanel(null);

  const sidePanel =
    openPanel === 'claims' && activeDebate ? (
      <DebateClaimsPanel debate={activeDebate} onClose={closePanel} />
    ) : openPanel === 'comments' && activeDebate ? (
      // Keyed so scrolling to the next debate resets the panel rather than
      // carrying a half-typed reply across to a different debate's thread.
      <EntityCommentsPanel key={activeDebate.id} entityId={activeDebate.id} spaceId={spaceId} onClose={closePanel} />
    ) : null;

  // Keep the feed in the same tree position whether or not a side panel is open, so
  // toggling the claims/join panel doesn't remount the players and restart playback.
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
  root,
  scrollHint,
  onActivate,
  onOpenJoin,
  onOpenClaims,
  onOpenComments,
}: {
  debate: Debate;
  spaceId: string;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
  active: boolean;
  root: HTMLElement | null;
  scrollHint: { isVisible: boolean; isLeaving: boolean } | null;
  onActivate: () => void;
  onOpenJoin: () => void;
  onOpenClaims: () => void;
  onOpenComments: () => void;
}) {
  const itemRef = React.useRef<HTMLElement | null>(null);
  const winnerVotes = useDebateVotes(debate);
  const shareAction = useDebateShareAction(debate, active);
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
    onClaims: onOpenClaims,
    shareAction,
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
              onOpenJoin={onOpenJoin}
            />
          </div>
          <div className="mt-6 md:mt-7">
            <DebateFeedPlayer debate={debate} active={active} votes={winnerVotes} />
          </div>
          {/* Mobile: horizontal bar below the videos. Wrapper controls display so
              it doesn't collide with the bar's own `flex`. */}
          <div className="mt-3 hidden md:block">
            <DebateInteractionBar orientation="horizontal" {...interactionProps} />
          </div>
          {/* `top-full` hangs it just below the debate without taking part in the column's
              height, which the media sizing has no room to spare for. */}
          {scrollHint?.isVisible && (
            <DebateScrollHint leaving={scrollHint.isLeaving} className="absolute inset-x-0 top-full mt-4" />
          )}
        </div>
        {/* Desktop: vertical rail to the right of the videos. */}
        <div className="flex flex-col justify-end md:hidden">
          <DebateInteractionBar orientation="vertical" {...interactionProps} />
        </div>
      </div>
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
  onOpenJoin,
}: {
  claim: string;
  claimEntityId: string;
  spaceId: string;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
  onOpenJoin: () => void;
}) {
  const claimRef = React.useRef<HTMLHeadingElement | null>(null);
  const [isClaimExpanded, setIsClaimExpanded] = React.useState(false);
  const [isClaimOverflowing, setIsClaimOverflowing] = React.useState(false);

  React.useEffect(() => setIsClaimExpanded(false), [claim]);

  React.useLayoutEffect(() => {
    const element = claimRef.current;
    if (!element || isClaimExpanded) return;

    const measureOverflow = () =>
      setIsClaimOverflowing(
        exceedsLineClamp({
          contentHeight: element.scrollHeight,
          clampedHeight: element.clientHeight,
          // Read on every measure rather than once: the breakpoint swaps the whole type scale, so a
          // rotation or a resize past 767px changes the line height this is counting in.
          lineHeight: parseFloat(getComputedStyle(element).lineHeight),
          maxLines: CLAIM_CLAMP_LINES,
        })
      );
    measureOverflow();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);
    return () => observer.disconnect();
  }, [claim, isClaimExpanded]);

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
        <Button
          type="button"
          // Exempts this button from the hub's outside-pointerdown dismissal, the same way the
          // navbar's opener is exempt. Without it the pointerdown closed the hub and the click
          // that followed reopened it, which read as a flicker.
          data-debates-hub-opener
          variant="secondary"
          small
          onClick={onOpenJoin}
          className="!h-7 shrink-0 !rounded-full !px-[11px] !py-0 !text-[16px] !leading-[13px] !font-normal !tracking-[-0.35px] !shadow-none md:!px-3 md:!text-[18px] md:!leading-[22px] md:!tracking-[-0.36px]"
        >
          Join a debate
        </Button>
      </div>
      <h2
        ref={claimRef}
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
