'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicRecentDebateModel } from '../models';
import { DebateGalleryCard } from './debate-gallery-card';
import { ArrowLeftIcon, ArrowRightIcon } from './icons';
import { ListRankingHeaderControl, ListRankingWorkspace, type RankableListItem, useListRanking } from './list-ranking';

export interface RecentDebatesGalleryProps {
  debates: readonly TopicRecentDebateModel[];
  title?: string;
  seeAllHref?: string;
  onSeeAll?: () => void;
  className?: string;
}

/**
 * Horizontal snap-scroll Recent debates gallery modeled on Geo Genesis's compact debate gallery cards:
 * two stacked 480:289 speaker video stills with play overlay and header scroll controls. The card is only
 * the video: the claim sits over the top-left (two lines max) and each speaker's chip sits at the bottom-left
 * of their own panel. Voting and the overflow menu live on the debate page.
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
          {displayDebates.map(debate => (
            <DebateGalleryCard key={debate.id} debate={debate} />
          ))}
        </div>
      </div>
    </section>
  );
}
