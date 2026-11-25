'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { ActionContextProvider } from '~/core/action-context-provider';

import type { TopicRecentDebateModel, TopicRecentDebateParticipantModel } from '../models';
import { ArrowLeftIcon, ArrowRightIcon, PlayIcon } from './icons';
import { ListRankingHeaderControl, ListRankingWorkspace, type RankableListItem, useListRanking } from './list-ranking';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface RecentDebatesGalleryProps {
  debates: readonly TopicRecentDebateModel[];
  title?: string;
  seeAllHref?: string;
  onSeeAll?: () => void;
  className?: string;
}

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * Horizontal snap-scroll Recent debates gallery modeled on Geo Genesis's compact debate gallery cards:
 * two stacked 480:289 speaker video stills with play overlay and header scroll controls. Experimental
 * look-test: the claim sits over the top of the video (two lines max) instead of in a footer below it,
 * and the card has no vote buttons or split line.
 */
export function RecentDebatesGallery({
  debates,
  title = 'Recent debates',
  seeAllHref,
  onSeeAll,
  className,
}: RecentDebatesGalleryProps) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [nav, setNav] = React.useState({ left: false, right: debates.length > 3 });

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = scroller.getBoundingClientRect();
      const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-debate-gallery-card]'));
      const firstBox = cards.at(0)?.getBoundingClientRect();
      const lastBox = cards.at(-1)?.getBoundingClientRect();
      const next = {
        left: Boolean(firstBox && firstBox.left < box.left - 1),
        right: Boolean(lastBox && lastBox.right > box.right + 1),
      };
      setNav(current => (current.left === next.left && current.right === next.right ? current : next));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(scroller);
    window.addEventListener('resize', schedule);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', schedule);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [debates.length]);

  const scrollByCard = React.useCallback((direction: -1 | 1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const firstCard = scroller.querySelector<HTMLElement>('[data-debate-gallery-card]');
    const cardWidth = firstCard?.getBoundingClientRect().width || 300;
    scroller.scrollBy({ left: direction * (cardWidth + 16), behavior: 'smooth' });
  }, []);

  const rankingKey = React.useMemo(() => {
    const sig = debates
      .slice(0, 3)
      .map(d => d.id)
      .join(',');
    return `debates:${title}:${sig}`;
  }, [debates, title]);

  const ranking = useListRanking({ listKey: rankingKey, items: debates });

  const rankableItems = React.useMemo<RankableListItem[]>(
    () =>
      debates.map(debate => ({
        id: debate.id,
        title: debate.claimTitle,
        subtitle: `${debate.participants[0].name} vs. ${debate.participants[1].name}`,
        meta: [debate.date, debate.votesLabel].filter(Boolean).join(' · '),
        imageUrl: debate.participants[0].avatarUrl,
      })),
    [debates]
  );

  if (debates.length === 0) return null;

  const displayDebates = ranking.orderedItems;

  return (
    <section id="recent-debates" aria-label={title} className={cx('flex flex-col gap-3', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>

        <div className="flex items-center gap-2">
          <ListRankingHeaderControl
            title={title}
            hasMyRanking={ranking.hasMyRanking}
            viewMode={ranking.viewMode}
            onViewModeChange={ranking.setViewMode}
            onOpen={ranking.open}
            disabled={debates.length < 2}
          />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Scroll debates left"
              disabled={!nav.left}
              onClick={() => scrollByCard(-1)}
              className="inline-grid size-8 cursor-pointer place-items-center rounded-full border border-grey-02 bg-white text-text transition-colors hover:border-text disabled:cursor-default disabled:border-divider disabled:text-grey-03"
            >
              <ArrowLeftIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Scroll debates right"
              disabled={!nav.right}
              onClick={() => scrollByCard(1)}
              className="inline-grid size-8 cursor-pointer place-items-center rounded-full border border-grey-02 bg-white text-text transition-colors hover:border-text disabled:cursor-default disabled:border-divider disabled:text-grey-03"
            >
              <ArrowRightIcon className="size-3.5" />
            </button>
          </div>

          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="inline-flex h-8 items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13.5px] font-medium text-text no-underline transition-colors hover:border-text"
            >
              See all
            </Link>
          ) : onSeeAll ? (
            <button
              type="button"
              onClick={onSeeAll}
              className="inline-flex h-8 cursor-pointer items-center rounded-full border border-grey-02 bg-white px-3.5 text-[13.5px] font-medium text-text transition-colors hover:border-text"
            >
              See all
            </button>
          ) : null}
        </div>
      </header>

      <ListRankingWorkspace
        open={ranking.isOpen}
        title={title}
        items={rankableItems}
        initialOrder={ranking.myOrder}
        onClose={ranking.close}
        onPublish={ranking.publish}
      />

      <div className="@container relative">
        <div
          ref={scrollerRef}
          className="-mx-2 flex snap-x snap-mandatory scroll-px-2 [scrollbar-width:none] items-stretch gap-4 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {displayDebates.map((debate, index) => (
            // Names the list and the card on every action taken in it.
            <ActionContextProvider
              key={debate.id}
              value={{ list_id: 'template_recent_debates', item_position: index + 1 }}
            >
              <RecentDebateGalleryCard debate={debate} />
            </ActionContextProvider>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentDebateGalleryCard({ debate }: { debate: TopicRecentDebateModel }) {
  const [slot1, slot2] = debate.participants;

  const mediaContent = (
    <div className="relative flex flex-col overflow-hidden bg-[#18191c]">
      <SpeakerVideoStill participant={slot1} tone="top" />
      <div className="h-px w-full bg-white/15" aria-hidden />
      <SpeakerVideoStill participant={slot2} tone="bottom" />

      {/* Claim over the top of the video, two lines max, on a dark scrim so it reads on any frame */}
      <div
        data-debate-claim-overlay
        className="pointer-events-none absolute inset-x-0 top-0 z-[3] bg-gradient-to-b from-black/80 via-black/45 to-transparent px-3 pt-2.5 pb-8"
      >
        <span className="line-clamp-2 text-[15px] leading-[20px] font-semibold text-pretty text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.45)]">
          {debate.claimTitle}
        </span>
      </div>

      {/* Centered Play trigger across the two-speaker seam (matches Genesis debate cards) */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 z-[4] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-text shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-transform duration-150 group-hover/media:scale-105"
      >
        <PlayIcon className="ml-0.5 size-4" />
      </span>

      {debate.duration && (
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 z-[4] rounded-md bg-black/70 px-1.5 py-0.5 text-[12px] leading-[15px] font-medium text-white tabular-nums backdrop-blur-xs">
          {debate.duration}
        </span>
      )}
    </div>
  );

  return (
    <article
      data-debate-gallery-card
      className={cx(
        'flex w-[84cqw] shrink-0 snap-start flex-col overflow-hidden transition-all duration-200 hover:-translate-y-[1.5px] hover:border-black/[0.06] hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.095),0_4px_14px_-2px_rgba(0,0,0,0.04)] @[540px]:w-[calc((100cqw-1rem)/2)] @[860px]:w-[calc((100cqw-2rem)/3)]',
        TEMPLATE_CARD_SURFACE
      )}
    >
      {debate.href ? (
        <Link
          href={debate.href}
          aria-label={`Watch debate: ${debate.claimTitle}`}
          className="group/media block no-underline"
        >
          {mediaContent}
        </Link>
      ) : debate.onSelect ? (
        <button
          type="button"
          onClick={debate.onSelect}
          aria-label={`Watch debate: ${debate.claimTitle}`}
          className="group/media block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
        >
          {mediaContent}
        </button>
      ) : (
        mediaContent
      )}
    </article>
  );
}

function SpeakerProfileAvatar({
  name,
  avatarUrl,
  communityColor,
  size = 'sm',
}: {
  name: string;
  avatarUrl?: string | null;
  communityColor: string;
  size?: 'sm' | 'lg';
}) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  const showPhoto = Boolean(avatarUrl) && !failed;
  const isLarge = size === 'lg';

  if (showPhoto) {
    return (
      <img
        src={avatarUrl ?? undefined}
        alt=""
        aria-hidden
        onError={() => setFailed(true)}
        className={cx(
          'shrink-0 rounded-full object-cover',
          isLarge
            ? 'size-15 border border-white/20 shadow-[0_6px_20px_rgba(0,0,0,0.35)]'
            : 'size-4.5 ring-1 ring-white/25'
        )}
        draggable={false}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full font-semibold text-white/95',
        isLarge
          ? 'size-15 border border-white/15 bg-white/10 text-[16px] tracking-[0.02em] backdrop-blur-xs'
          : 'size-4.5 bg-white/15 text-[9px] ring-1 ring-white/20'
      )}
      style={isLarge ? { boxShadow: `0 0 0 2px ${communityColor}66` } : undefined}
    >
      {initialsFrom(name)}
    </span>
  );
}

function SpeakerVideoStill({
  participant,
  tone,
}: {
  participant: TopicRecentDebateParticipantModel;
  tone: 'top' | 'bottom';
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);

  React.useEffect(() => {
    setImgFailed(false);
    setImgLoaded(false);
  }, [participant.avatarUrl]);

  const showImage = Boolean(participant.avatarUrl) && !imgFailed;

  return (
    <div
      className="relative aspect-[480/289] w-full overflow-hidden"
      style={{
        background:
          tone === 'top'
            ? `radial-gradient(circle at 50% 42%, ${participant.communityColor}30 0%, #23252a 56%, #141518 100%)`
            : `radial-gradient(circle at 50% 42%, ${participant.communityColor}2e 0%, #1f2228 56%, #131417 100%)`,
      }}
    >
      {/* Portrait fallback shown while still loads or whenever a debate has no cut speaker still */}
      {(!showImage || !imgLoaded) && (
        <div className="absolute inset-0 grid place-items-center">
          <SpeakerProfileAvatar
            name={participant.name}
            avatarUrl={participant.profileAvatarUrl}
            communityColor={participant.communityColor}
            size="lg"
          />
        </div>
      )}

      {showImage && (
        <img
          src={participant.avatarUrl}
          alt={participant.name}
          decoding="async"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgFailed(true)}
          className={cx(
            'relative z-[1] h-full w-full object-cover transition-opacity duration-200',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
          draggable={false}
        />
      )}

      {/* Subtle bottom-edge scrim + speaker avatar, name & stance chip. Both speakers' chips sit at the
          bottom-left of their own panel; the top of the video carries the claim. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-12 bg-gradient-to-t from-black/65 to-transparent"
      />
      <div
        data-speaker-chip={tone}
        className={cx(
          'pointer-events-none absolute right-2.5 left-2.5 z-[3] flex max-w-[calc(100%-20px)] items-center gap-1.5 self-start',
          // The play button straddles the seam under the top chip. On one- and two-up cards the chip reaches
          // it, so it rides just above the button; on three-up desktop cards it sits flush at the bottom.
          tone === 'top' ? 'bottom-7 @[860px]:bottom-2' : 'bottom-2'
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/60 py-0.5 pr-2.5 pl-1 text-[12px] leading-[16px] text-white backdrop-blur-xs">
          <SpeakerProfileAvatar
            name={participant.name}
            avatarUrl={participant.profileAvatarUrl}
            communityColor={participant.communityColor}
            size="sm"
          />
          <span className="truncate font-medium">{participant.name}</span>
          <span className="shrink-0 text-white/70">· {participant.position}</span>
        </span>
      </div>
    </div>
  );
}
