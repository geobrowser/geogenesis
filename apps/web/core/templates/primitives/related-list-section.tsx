'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityLinkKind, EntityLinkRowModel, EntityListSectionModel, SourceMediaKind } from '../models';
import {
  ArrowUpRightIcon,
  ArticleIcon,
  ChevronRightIcon,
  DatasetIcon,
  DocumentIcon,
  PlayIcon,
  TweetIcon,
} from './icons';
import { TemplateBadge, type TemplateBadgeTone } from './template-shell';

const LINK_KIND_TONE: Record<EntityLinkKind, TemplateBadgeTone> = {
  claim: 'neutral',
  event: 'event',
  'news-story': 'story',
  source: 'source',
  post: 'post',
  debate: 'judgment',
  topic: 'neutral',
  case: 'neutral',
};

function inferMediaType(item: EntityLinkRowModel): SourceMediaKind {
  if (item.mediaType) return item.mediaType;
  if (item.kind === 'post') return 'tweet';
  if (item.kind === 'news-story') return 'article';
  if (item.kind === 'debate') return 'video';
  if (/dataset|data|figures|records|tally/i.test(`${item.kindLabel} ${item.meta ?? ''}`)) return 'dataset';
  return 'document';
}

function MediaIcon({ type }: { type: SourceMediaKind }) {
  switch (type) {
    case 'video':
      return <PlayIcon className="size-4 text-purple" />;
    case 'tweet':
      return <TweetIcon className="size-4 text-text" />;
    case 'dataset':
      return <DatasetIcon className="size-4 text-ctaPrimary" />;
    case 'article':
      return <ArticleIcon className="size-4 text-ctaPrimary" />;
    default:
      return <DocumentIcon className="size-4 text-grey-04" />;
  }
}

export interface RelatedListSectionProps {
  section: EntityListSectionModel;
  className?: string;
}

/**
 * Structured section for related entities and rich source media (articles, videos, tweets, reports, datasets).
 *
 * - `layout: 'cards'` (or auto-enabled when items carry rich media metadata like `mediaType` / `excerpt` / `duration`)
 *   renders clean format-aware cards for videos, tweets, articles, and datasets.
 * - `layout: 'list'` renders a calm, scannable hairline list (showing type badges only when kinds are mixed).
 */
export function RelatedListSection({ section, className }: RelatedListSectionProps) {
  const { title, subtitle, items, emptyText = 'Nothing linked yet.', action, layout } = section;
  const isMixedList = items.length > 1 && items.some(item => item.kind !== items[0]?.kind);
  const useCards =
    layout === 'cards' ||
    (layout !== 'list' &&
      items.some(item => Boolean(item.mediaType || item.excerpt || item.duration || item.authorHandle)));

  return (
    <section aria-label={title} className={cx('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
          {subtitle && <p className="m-0 text-[15px] leading-[21px] text-grey-04">{subtitle}</p>}
        </div>
        {action &&
          (action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 text-[15px] font-medium whitespace-nowrap text-ctaPrimary no-underline hover:text-ctaHover"
            >
              <span>{action.label}</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[15px] font-medium whitespace-nowrap text-ctaPrimary hover:text-ctaHover"
            >
              <span>{action.label}</span>
            </button>
          ))}
      </div>

      {items.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-grey-02 px-5 py-4 text-[15px] text-grey-04">
          {emptyText}
        </p>
      ) : useCards ? (
        <div className="grid grid-cols-1 gap-3.5 @[640px]:grid-cols-2">
          {items.map(item => (
            <RichMediaCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/80 bg-white">
          {items.map(item => (
            <RelatedListRow key={item.id} item={item} showKindBadge={isMixedList && !item.avatarPair} />
          ))}
        </div>
      )}
    </section>
  );
}

function RichMediaCard({ item }: { item: EntityLinkRowModel }) {
  const mediaType = inferMediaType(item);
  const cardClasses =
    'group flex h-full w-full flex-col justify-between gap-3.5 rounded-xl border border-grey-02/80 bg-white p-5 text-left text-text no-underline transition-colors hover:border-text';

  let body: React.ReactNode;

  if (mediaType === 'video') {
    body = (
      <>
        <div className="flex flex-col gap-3">
          <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-lg bg-grey-01">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1.5 text-grey-04">
                <span className="inline-grid size-11 place-items-center rounded-full bg-text text-white transition-transform group-hover:scale-105">
                  <PlayIcon className="ml-0.5 size-5" />
                </span>
              </div>
            )}
            {item.thumbnailUrl && (
              <span className="absolute inline-grid size-11 place-items-center rounded-full bg-text/90 text-white shadow-card transition-transform group-hover:scale-105">
                <PlayIcon className="ml-0.5 size-5" />
              </span>
            )}
            {item.duration && (
              <span className="absolute right-2.5 bottom-2.5 rounded-md bg-text/85 px-2 py-0.5 text-[13px] font-medium text-white tabular-nums">
                {item.duration}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 text-[14px] text-grey-04">
              <PlayIcon className="size-3.5 text-purple" />
              <span>{[item.publisher, item.date].filter(Boolean).join(' · ') || item.meta || 'Video'}</span>
            </span>
            <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text group-hover:text-ctaPrimary">
              {item.title}
            </h3>
            {item.excerpt && <p className="m-0 line-clamp-2 text-[15px] leading-[22px] text-grey-04">{item.excerpt}</p>}
          </div>
        </div>
      </>
    );
  } else if (mediaType === 'tweet') {
    body = (
      <>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-grey-01 text-text">
                <TweetIcon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-[15px] leading-[19px] font-semibold text-text">
                  {item.publisher ?? item.title}
                </span>
                {item.authorHandle && (
                  <span className="truncate text-[14px] leading-[18px] text-grey-04">{item.authorHandle}</span>
                )}
              </div>
            </div>
            {item.date && <span className="shrink-0 text-[14px] text-grey-04">{item.date}</span>}
          </div>

          <p className="m-0 text-[16px] leading-[24px] text-text">{item.excerpt ?? item.title}</p>
        </div>

        <div className="flex items-center justify-between border-t border-divider pt-2.5 text-[14px] text-grey-04">
          <span>{item.meta ?? 'Social post'}</span>
          <ArrowUpRightIcon className="size-4 text-grey-03 transition-colors group-hover:text-text" />
        </div>
      </>
    );
  } else {
    // Article, Report, Court Document, or Dataset
    const eyebrow = [item.publisher, item.date].filter(Boolean).join(' · ') || item.meta;
    body = (
      <>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2 text-[14px] text-grey-04">
              <MediaIcon type={mediaType} />
              <span className="truncate font-medium">{eyebrow || item.kindLabel}</span>
            </span>
            <ArrowUpRightIcon className="size-4 text-grey-03 transition-colors group-hover:text-text" />
          </div>

          <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text transition-colors group-hover:text-ctaPrimary">
            {item.title}
          </h3>

          {item.excerpt && <p className="m-0 line-clamp-2 text-[15px] leading-[22px] text-grey-04">{item.excerpt}</p>}
        </div>

        {!item.excerpt && item.meta && item.publisher && <span className="text-[14px] text-grey-04">{item.meta}</span>}
      </>
    );
  }

  if (!item.plain && item.href) {
    return (
      <Link href={item.href} className={cardClasses}>
        {body}
      </Link>
    );
  }
  if (!item.plain && item.onSelect) {
    return (
      <button type="button" onClick={item.onSelect} className={cx(cardClasses, 'cursor-pointer')}>
        {body}
      </button>
    );
  }
  if (!item.plain && item.externalUrl) {
    return (
      <a href={item.externalUrl} target="_blank" rel="noopener noreferrer" className={cardClasses}>
        {body}
      </a>
    );
  }
  return <article className={cardClasses}>{body}</article>;
}

function RelatedListRow({ item, showKindBadge }: { item: EntityLinkRowModel; showKindBadge: boolean }) {
  const rowClasses = cx(
    'flex w-full items-center gap-3.5 px-5 py-4 text-left text-text no-underline transition-colors',
    !item.plain && (item.href || item.onSelect) && 'hover:bg-bg'
  );

  const inner = (
    <>
      {item.avatarPair && (
        <span className="flex shrink-0 -space-x-2">
          <img src={item.avatarPair[0]} alt="" className="size-8 rounded-full border-2 border-white object-cover" />
          <img src={item.avatarPair[1]} alt="" className="size-8 rounded-full border-2 border-white object-cover" />
        </span>
      )}

      {showKindBadge && <TemplateBadge tone={LINK_KIND_TONE[item.kind]}>{item.kindLabel}</TemplateBadge>}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] leading-[23px] font-medium text-text">{item.title}</span>
        {item.meta && <span className="text-[15px] leading-[20px] text-grey-04">{item.meta}</span>}
      </span>

      {!item.plain && (item.href || item.onSelect) && <ChevronRightIcon className="size-4 text-grey-03" />}
    </>
  );

  if (!item.plain && item.href) {
    return (
      <Link href={item.href} className={rowClasses}>
        {inner}
      </Link>
    );
  }

  if (!item.plain && item.onSelect) {
    return (
      <button
        type="button"
        onClick={item.onSelect}
        className={cx(rowClasses, 'cursor-pointer border-0 bg-transparent')}
      >
        {inner}
      </button>
    );
  }

  return <div className={rowClasses}>{inner}</div>;
}
