'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { TopicRecentDebateModel, TopicRecentDebateParticipantModel } from '../models';
import { formatCompactCount, formatPercentInt } from '../models';
import { EntityInlineContext, EntityOverflowMenu } from './entity-overflow-menu';
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, PlayIcon, ThumbDownIcon, ThumbUpIcon } from './icons';
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
 * two stacked 480:289 speaker video stills with play overlay, claim title, inline Agree/Disagree buttons,
 * and header scroll controls.
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

  if (debates.length === 0) return null;

  return (
    <section id="recent-debates" aria-label={title} className={cx('flex flex-col gap-3', className)}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>

        <div className="flex items-center gap-2.5">
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

      <div className="@container relative">
        <div
          ref={scrollerRef}
          className="-mx-2 flex snap-x snap-mandatory [scrollbar-width:none] items-stretch gap-4 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {debates.map(debate => (
            <RecentDebateGalleryCard key={debate.id} debate={debate} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentDebateGalleryCard({ debate }: { debate: TopicRecentDebateModel }) {
  const [slot1, slot2] = debate.participants;

  const handleVoteClick = (choice: 'agree' | 'disagree') => {
    if (!debate.onVote) return;
    if (debate.userVote === choice && debate.onClearVote) {
      debate.onClearVote();
      return;
    }
    debate.onVote(choice);
  };

  const mediaContent = (
    <div className="relative flex flex-col overflow-hidden bg-[#18191c]">
      <SpeakerVideoStill participant={slot1} tone="top" />
      <div className="h-px w-full bg-white/15" aria-hidden />
      <SpeakerVideoStill participant={slot2} tone="bottom" />

      {/* Centered Play trigger across the two-speaker seam (matches Genesis debate cards) */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-text shadow-[0_6px_20px_rgba(0,0,0,0.28)] transition-transform duration-150 group-hover/media:scale-105"
      >
        <PlayIcon className="ml-0.5 size-4" />
      </span>

      {debate.duration && (
        <span className="pointer-events-none absolute right-2.5 bottom-2.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[12px] leading-[15px] font-medium text-white tabular-nums backdrop-blur-xs">
          {debate.duration}
        </span>
      )}
    </div>
  );

  const titleContent = (
    <span className="line-clamp-2 min-h-[42px] text-[15.5px] leading-[21px] font-semibold text-pretty text-text transition-colors group-hover/title:text-[#4c1fd4]">
      {debate.claimTitle}
    </span>
  );

  return (
    <article
      data-debate-gallery-card
      className={cx(
        'flex w-[min(300px,84cqw)] shrink-0 snap-start flex-col overflow-hidden transition-all duration-200 hover:-translate-y-[1.5px] hover:border-black/[0.06] hover:shadow-[0_18px_40px_-8px_rgba(0,0,0,0.095),0_4px_14px_-2px_rgba(0,0,0,0.04)]',
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

      {/* Compact claim footer mirroring Genesis's DebateClaimFooter */}
      <div className="flex flex-1 flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2 text-[13px] text-grey-04">
          <span className="truncate tabular-nums">
            {debate.date} · {debate.votesLabel}
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            <EntityOverflowMenu target={{ id: debate.id, kind: 'Debate', title: debate.claimTitle }} />
            {debate.href ? (
              <Link
                href={debate.href}
                aria-label="Open full debate"
                className="inline-grid size-6 shrink-0 place-items-center rounded-md text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <ArrowUpRightIcon className="size-3.5" />
              </Link>
            ) : debate.onSelect ? (
              <button
                type="button"
                onClick={debate.onSelect}
                aria-label="Open full debate"
                className="inline-grid size-6 shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-grey-04 transition-colors hover:bg-grey-01 hover:text-text"
              >
                <ArrowUpRightIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        {debate.href ? (
          <Link href={debate.href} className="group/title block text-text no-underline">
            {titleContent}
          </Link>
        ) : debate.onSelect ? (
          <button
            type="button"
            onClick={debate.onSelect}
            className="group/title block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-text"
          >
            {titleContent}
          </button>
        ) : (
          titleContent
        )}

        {debate.onVote && (
          <div className="flex items-center gap-1.5 pt-0.5" role="group" aria-label={`Vote on ${debate.claimTitle}`}>
            <button
              type="button"
              aria-pressed={debate.userVote === 'agree'}
              onClick={() => handleVoteClick('agree')}
              className={cx(
                'inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                debate.userVote === 'agree'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <ThumbUpIcon className="size-3.5 shrink-0" />
              <span>Agree</span>
              {debate.agreeCount !== undefined && debate.agreeCount > 0 && (
                <span
                  className={cx(
                    'text-[12px] tabular-nums',
                    debate.userVote === 'agree' ? 'text-white/80' : 'text-grey-04'
                  )}
                >
                  {formatCompactCount(debate.agreeCount)}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-pressed={debate.userVote === 'disagree'}
              onClick={() => handleVoteClick('disagree')}
              className={cx(
                'inline-flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                debate.userVote === 'disagree'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <ThumbDownIcon className="size-3.5 shrink-0" />
              <span>Disagree</span>
              {debate.disagreeCount !== undefined && debate.disagreeCount > 0 && (
                <span
                  className={cx(
                    'text-[12px] tabular-nums',
                    debate.userVote === 'disagree' ? 'text-white/80' : 'text-grey-04'
                  )}
                >
                  {formatCompactCount(debate.disagreeCount)}
                </span>
              )}
            </button>
          </div>
        )}

        {debate.split && debate.split.rows.length > 0 && (
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-divider pt-2.5 text-[12.5px] text-grey-04">
            {debate.split.rows.slice(0, 2).map(row => (
              <span key={row.id} className="inline-flex min-w-0 items-center gap-1.5 tabular-nums">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="truncate">{row.label}</span>
                <strong className="font-semibold text-text">{formatPercentInt(row.percent)}</strong>
              </span>
            ))}
          </div>
        )}

        <EntityInlineContext targetId={debate.id} targetTitle={debate.claimTitle} targetKind="Debate" />
      </div>
    </article>
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

  React.useEffect(() => {
    setImgFailed(false);
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
      {showImage ? (
        <img
          src={participant.avatarUrl}
          alt={participant.name}
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span
            className="grid size-13 place-items-center rounded-full border border-white/15 bg-white/10 text-[16px] font-semibold tracking-[0.02em] text-white/90 backdrop-blur-xs"
            style={{ boxShadow: `0 0 0 2px ${participant.communityColor}66` }}
          >
            {initialsFrom(participant.name)}
          </span>
        </div>
      )}

      {/* Subtle edge scrim + speaker name & position chip (top edge on top tile so it never collides with the center play button) */}
      <div
        aria-hidden
        className={cx(
          'pointer-events-none absolute inset-x-0 h-12',
          tone === 'top'
            ? 'top-0 bg-gradient-to-b from-black/60 to-transparent'
            : 'bottom-0 bg-gradient-to-t from-black/65 to-transparent'
        )}
      />
      <div
        className={cx(
          'pointer-events-none absolute right-2.5 left-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 self-start',
          tone === 'top' ? 'top-2' : 'bottom-2'
        )}
      >
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[12px] leading-[16px] text-white backdrop-blur-xs">
          <span
            aria-hidden
            className="inline-block size-2 shrink-0 rounded-full"
            style={{ backgroundColor: participant.communityColor }}
          />
          <span className="truncate font-medium">{participant.name}</span>
          <span className="shrink-0 text-white/65">· {participant.position}</span>
        </span>
      </div>
    </div>
  );
}
