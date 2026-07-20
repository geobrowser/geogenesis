'use client';

import { keepPreviousData } from '@tanstack/react-query';

import * as React from 'react';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import type { Debate } from '~/core/debates/api';
import { useSpaceDebates } from '~/core/debates/hooks';
import { isWatchableDebate } from '~/core/debates/playback-utils';
import { useSpace } from '~/core/hooks/use-space';
import { useQueryEntities } from '~/core/sync/use-store';

import { Avatar } from '~/design-system/avatar';
import { Button } from '~/design-system/button';
import { ArrowLeft } from '~/design-system/icons/arrow-left';
import { Text } from '~/design-system/text';

import { DebateClaimsPanel } from './debate-claims-panel';
import { DebateFeedPlayer } from './debate-feed-player';
import { DebateInteractionBar, type DebateVote } from './debate-interaction-bar';
import { JoinDebatePanel } from './join-debate-panel';

const PAGE_SIZE = 5;

export function DebatesBrowseFeed({ spaceId }: { spaceId: string }) {
  const debatesQuery = useSpaceDebates(spaceId, true);
  const { space } = useSpace(spaceId);

  const debates = React.useMemo(() => {
    const watchable = (debatesQuery.data?.debates ?? []).filter(isWatchableDebate);
    return watchable.sort((a, b) => completedTime(b) - completedTime(a));
  }, [debatesQuery.data?.debates]);

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

  const visibleDebates = debates.slice(0, visibleCount);

  React.useEffect(() => {
    if (!activeId && visibleDebates.length > 0) setActiveId(visibleDebates[0].id);
  }, [activeId, visibleDebates]);

  const feed = (
    <div
      ref={setScrollEl}
      className="no-scrollbar h-[calc(100dvh-2.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth"
    >
      {debatesQuery.isLoading && debates.length === 0 && <FeedMessage>Loading debates…</FeedMessage>}
      {debatesQuery.error instanceof Error && debates.length === 0 && (
        <FeedMessage>Could not load debates: {debatesQuery.error.message}</FeedMessage>
      )}
      {!debatesQuery.isLoading && !debatesQuery.error && debates.length === 0 && (
        <FeedMessage>No debates to watch yet. Start one from the Claims tab.</FeedMessage>
      )}
      {visibleDebates.map(debate => (
        <DebateFeedItem
          key={debate.id}
          debate={debate}
          spaceName={space?.entity.name ?? 'Space'}
          spaceImage={space?.entity.image}
          topics={topicsByClaimId.get(debate.claim.claim_entity_id) ?? []}
          active={activeId === debate.id}
          root={scrollEl}
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

  if (sidePanel) {
    return (
      <div className="flex h-[calc(100dvh-2.75rem)] items-stretch">
        <div className="min-w-0 flex-1">{feed}</div>
        {sidePanel}
      </div>
    );
  }

  return feed;
}

function DebateFeedItem({
  debate,
  spaceName,
  spaceImage,
  topics,
  active,
  root,
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
  onActivate: () => void;
  onOpenJoin: () => void;
  onOpenClaims: () => void;
}) {
  const itemRef = React.useRef<HTMLElement | null>(null);
  const [vote, setVote] = React.useState<DebateVote>(null);
  const [hasVoted, setHasVoted] = React.useState(false);

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
    score: vote === 'up' ? 1 : vote === 'down' ? -1 : 0,
    vote,
    onVote: setVote,
    commentCount: 0,
    claimsCount: 0,
    onComment: () => undefined,
    onClaims: onOpenClaims,
    onShare: () => undefined,
  };

  return (
    <section ref={itemRef} className="flex h-full snap-start items-center justify-center px-4">
      <div className="flex items-stretch gap-3">
        {/* Column width is driven by height so both 480×289 videos + header fit
            the viewport at once (fills the screen, TikTok-style). */}
        <div
          className="flex max-w-[90vw] flex-col gap-4"
          style={{ width: 'min(480px, calc((100dvh - 10rem) * 0.83))' }}
        >
          {/* Mobile-only back arrow; desktop keeps the app nav. NB: breakpoints
              here are desktop-first (md = max-width:767px), so md: targets mobile. */}
          <button
            type="button"
            aria-label="Back"
            onClick={() => window.history.back()}
            className="-mb-1 hidden size-8 items-center text-text md:flex"
          >
            <ArrowLeft />
          </button>
          <DebateTitleHeader
            claim={debate.claim.claim}
            spaceName={spaceName}
            spaceImage={spaceImage}
            topics={topics}
            onOpenJoin={onOpenJoin}
          />
          <DebateFeedPlayer
            debate={debate}
            active={active}
            hasVoted={hasVoted}
            onSelectWinner={() => setHasVoted(true)}
          />
          {/* Mobile: horizontal bar below the videos. Wrapper controls display so
              it doesn't collide with the bar's own `flex`. */}
          <div className="hidden md:block">
            <DebateInteractionBar orientation="horizontal" {...interactionProps} />
          </div>
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
          <Text as="span" variant="metadata" color="text" className="truncate">
            {spaceName}
          </Text>
          {topics.map(topic => (
            <React.Fragment key={topic}>
              <Text as="span" variant="metadata" color="grey-04">
                ·
              </Text>
              <Text as="span" variant="metadata" color="grey-04" className="truncate">
                {topic}
              </Text>
            </React.Fragment>
          ))}
        </div>
        <Button type="button" variant="secondary" small onClick={onOpenJoin} className="shrink-0">
          Join debate
        </Button>
      </div>
      <Text as="h2" variant="cardEntityTitle" color="text">
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
