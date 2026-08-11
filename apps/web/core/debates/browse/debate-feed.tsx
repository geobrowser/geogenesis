'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Debate } from '~/core/debates/api';
import { useProcessedVideoDebateIds, useSpaceDebates } from '~/core/debates/hooks';
import { isWatchableDebate } from '~/core/debates/playback-utils';
import {
  getPreparedSocialVideoHandoffMethod,
  handoffPreparedSocialVideo,
  isAbortError,
  usePreparedSocialVideo,
} from '~/core/debates/social-video-share';
import { useDebateVotes } from '~/core/debates/use-debate-votes';
import { useSpace } from '~/core/hooks/use-space';
import { ID } from '~/core/id';
import { useQueryEntities } from '~/core/sync/use-store';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Text } from '~/design-system/text';

import { DebateClaimsPanel } from './debate-claims-panel';
import { DebateFeedPlayer } from './debate-feed-player';
import { DebateInteractionBar, type DebateShareAction, type DebateVote } from './debate-interaction-bar';
import { DebateScrollHint } from './debate-scroll-hint';
import { JoinDebatePanel } from './join-debate-panel';

const PAGE_SIZE = 5;
const SHARE_PREPARATION_DWELL_MS = 5_000;

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

  // Two-stage gate (GEO-2412). `isWatchableDebate` only proves both raw recordings exist; a debate
  // whose media job failed or never ran still passes it, so readiness decides what renders.
  const candidates = React.useMemo(
    () => (debatesQuery.data?.debates ?? []).filter(isWatchableDebate),
    [debatesQuery.data?.debates]
  );
  const candidateIds = React.useMemo(() => candidates.map(debate => debate.id), [candidates]);
  const {
    processedIds,
    isLoading: mediaLoading,
    hasError: mediaError,
  } = useProcessedVideoDebateIds(candidateIds, candidateIds.length > 0);

  const debates = React.useMemo(() => {
    const processed = new Set(processedIds);
    const sorted = candidates
      .filter(debate => processed.has(debate.id))
      .sort((a, b) => completedTime(b) - completedTime(a));
    if (!initialDebateId) return sorted;
    // Navigating to a Debate entity lands you on that debate: hoist it to the top so it's the
    // first full-screen video, then let the rest of the space's debates scroll in below it.
    const anchorIndex = sorted.findIndex(debate => ID.equals(debate.id, initialDebateId));
    if (anchorIndex <= 0) return sorted;
    const [anchor] = sorted.splice(anchorIndex, 1);
    return [anchor, ...sorted];
  }, [candidates, processedIds, initialDebateId]);

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
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [claimsDebate, setClaimsDebate] = React.useState<Debate | null>(null);

  // The media lookups gate rendering, so the feed is still loading until they settle — otherwise it
  // flashes "no debates" and strands a valid anchor.
  const isLoading = debatesQuery.isLoading || mediaLoading;

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
  // Debates tab passes none and keeps its own empty/error states.
  const anchorMissing =
    initialDebateId != null && !isLoading && !debates.some(debate => ID.equals(debate.id, initialDebateId));

  const visibleDebates = debates.slice(0, visibleCount);

  // Keep an active debate whenever the list is non-empty — including when a
  // refetch, pagination, or space switch drops the current activeId out of view,
  // which would otherwise leave nothing active or autoplaying.
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
      className="no-scrollbar h-[calc(100dvh-2.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth md:h-dvh"
    >
      {debates.length === 0 && <FeedMessage>{emptyMessage}</FeedMessage>}
      {visibleDebates.map((debate, index) => (
        <DebateFeedItem
          key={debate.id}
          debate={debate}
          spaceName={space?.entity.name ?? 'Space'}
          spaceImage={space?.entity.image}
          topics={topicsByClaimId.get(debate.claim.claim_entity_id) ?? []}
          active={activeId === debate.id}
          root={scrollEl}
          // Only the debate the viewer lands on carries the nudge, and only when there's
          // something below it to scroll to.
          showScrollHint={index === 0 && debates.length > 1}
          onActivate={() => setActiveId(debate.id)}
          onOpenJoin={() => {
            setClaimsDebate(null);
            setJoinOpen(true);
          }}
          onOpenClaims={() => {
            setJoinOpen(false);
            setClaimsDebate(debate);
          }}
        />
      ))}
      {visibleCount < debates.length && (
        <LoadMoreSentinel root={scrollEl} onLoadMore={() => setVisibleCount(count => count + PAGE_SIZE)} />
      )}
    </div>
  );

  const sidePanel = joinOpen ? (
    <JoinDebatePanel spaceId={spaceId} onClose={() => setJoinOpen(false)} />
  ) : claimsDebate ? (
    <DebateClaimsPanel debate={claimsDebate} count={0} onClose={() => setClaimsDebate(null)} />
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
  spaceName,
  spaceImage,
  topics,
  active,
  root,
  showScrollHint,
  onActivate,
  onOpenJoin,
  onOpenClaims,
}: {
  debate: Debate;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
  active: boolean;
  root: HTMLElement | null;
  showScrollHint: boolean;
  onActivate: () => void;
  onOpenJoin: () => void;
  onOpenClaims: () => void;
}) {
  const itemRef = React.useRef<HTMLElement | null>(null);
  const [vote, setVote] = React.useState<DebateVote>(null);
  const [preparationEnabled, setPreparationEnabled] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const sharingRef = React.useRef(false);
  const activationGenerationRef = React.useRef(0);
  const winnerVotes = useDebateVotes(debate);
  const preparedVideo = usePreparedSocialVideo(debate.id, {
    enabled: active && preparationEnabled,
    includePreview: false,
  });

  React.useEffect(() => {
    setShareError(null);
    if (!active) {
      activationGenerationRef.current += 1;
      setPreparationEnabled(false);
      return;
    }

    const dwellTimer = window.setTimeout(() => setPreparationEnabled(true), SHARE_PREPARATION_DWELL_MS);
    return () => window.clearTimeout(dwellTimer);
  }, [active]);

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

  const handoffMethod = React.useMemo(
    () => (preparedVideo.file ? getPreparedSocialVideoHandoffMethod(preparedVideo.file) : null),
    [preparedVideo.file]
  );
  let shareState: DebateShareAction['state'] = 'preparing';
  if (isSharing) shareState = 'sharing';
  else if (active && (shareError || preparedVideo.status === 'error')) shareState = 'error';
  else if (active && preparedVideo.status === 'ready') shareState = 'ready';
  const shareTooltipMessage = getShareTooltipMessage({
    state: shareState,
    method: handoffMethod,
    error: shareError ?? preparedVideo.error,
  });
  const activateShare = () => {
    if (!active || sharingRef.current) return;
    if (preparedVideo.status === 'error') {
      setShareError(null);
      preparedVideo.retry();
      return;
    }
    if (!preparedVideo.file || !preparedVideo.downloadUrl) return;

    const file = preparedVideo.file;
    const downloadUrl = preparedVideo.downloadUrl;
    const activationGeneration = activationGenerationRef.current;
    sharingRef.current = true;
    setIsSharing(true);
    setShareError(null);
    const handoff = handoffPreparedSocialVideo({
      debateId: debate.id,
      title: debate.claim.claim,
      file,
      downloadUrl,
    });
    void handoff
      .catch(error => {
        if (activationGenerationRef.current === activationGeneration && !isAbortError(error)) {
          setShareError(error instanceof Error ? error.message : 'Could not share the video.');
        }
      })
      .finally(() => {
        sharingRef.current = false;
        setIsSharing(false);
      });
  };

  const interactionProps = {
    score: vote === 'up' ? 1 : vote === 'down' ? -1 : 0,
    vote,
    onVote: setVote,
    commentCount: 0,
    claimsCount: 0,
    onComment: () => undefined,
    onClaims: onOpenClaims,
    shareAction: {
      state: shareState,
      method: handoffMethod,
      tooltipMessage: shareTooltipMessage,
      onActivate: activateShare,
    } satisfies DebateShareAction,
  };

  return (
    <section ref={itemRef} className="flex h-full snap-start items-start justify-center px-4 pt-5 md:px-2 md:pt-3">
      <div className="flex items-stretch gap-3">
        <div className="flex w-[480px] min-w-0 flex-col md:w-[calc(100vw-1rem)]">
          {/* Mobile-only back arrow; desktop keeps the app nav. NB: breakpoints
              here are desktop-first (md = max-width:767px), so md: targets mobile. */}
          <button
            type="button"
            aria-label="Back"
            onClick={() => window.history.back()}
            className="-mb-3 hidden size-8 items-center justify-center text-text md:flex"
          >
            <ArrowLeft />
          </button>
          <div className="md:mt-4">
            <DebateTitleHeader
              claim={debate.claim.claim}
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
          {showScrollHint && <DebateScrollHint scrollEl={root} className="mt-4 md:mt-[30px]" />}
        </div>
        {/* Desktop: vertical rail to the right of the videos. */}
        <div className="flex flex-col justify-end md:hidden">
          <DebateInteractionBar orientation="vertical" {...interactionProps} />
        </div>
      </div>
    </section>
  );
}

function DebateTitleHeader({
  claim,
  spaceName,
  spaceImage,
  topics,
  onOpenJoin,
}: {
  claim: string;
  spaceName: string;
  spaceImage?: string | null;
  topics: string[];
  onOpenJoin: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="block size-4 shrink-0 overflow-hidden rounded-full bg-grey-02">
            <Avatar avatarUrl={spaceImage} value={spaceName} size={16} />
          </span>
          <Text as="span" variant="metadata" color="text" className="truncate !leading-[13px] !tracking-[-0.35px]">
            {spaceName}
          </Text>
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
          variant="secondary"
          small
          onClick={onOpenJoin}
          className="!h-7 shrink-0 !rounded-full !px-[11px] !py-0 !text-[16px] !leading-[13px] !font-normal !tracking-[-0.35px] !shadow-none md:!px-3 md:!text-[18px] md:!leading-[22px] md:!tracking-[-0.36px]"
        >
          Join a debate
        </Button>
      </div>
      <Text
        as="h2"
        variant="cardEntityTitle"
        color="text"
        className="!text-[22.4px] !leading-[21px] !tracking-[-0.672px] md:!text-[24px] md:!leading-6 md:!tracking-[-0.75px]"
      >
        {claim}
      </Text>
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

function getShareTooltipMessage({
  state,
  method,
  error,
}: Pick<DebateShareAction, 'state' | 'method'> & { error: string | null }) {
  if (state === 'preparing') return 'Preparing video for sharing… You can share soon.';
  if (state === 'sharing') return undefined;
  if (state === 'error') {
    const fallback = method ? 'Could not share the video.' : 'Could not prepare the video.';
    return `${error ?? fallback} Select to try again.`;
  }
  return method === 'download' ? 'Download the debate video.' : undefined;
}
