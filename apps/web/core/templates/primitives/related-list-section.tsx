'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type {
  EntityLinkKind,
  EntityLinkRowModel,
  EntityListSectionModel,
  SourceMediaKind,
  SourceQuoteModel,
} from '../models';
import { AddEntityItemPopover, EntityInlineContext, EntityOverflowMenu } from './entity-overflow-menu';
import {
  ArrowUpRightIcon,
  ArticleIcon,
  ChevronRightIcon,
  DatasetIcon,
  DocumentIcon,
  PlayIcon,
  TweetIcon,
} from './icons';
import {
  TEMPLATE_CARD_SURFACE,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
} from './template-shell';

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
  const [addedItems, setAddedItems] = React.useState<EntityLinkRowModel[]>([]);
  const allItems = [...addedItems, ...items];
  const isMixedList = allItems.length > 1 && allItems.some(item => item.kind !== allItems[0]?.kind);
  const useCards =
    layout === 'cards' ||
    (layout !== 'list' &&
      allItems.some(item => Boolean(item.mediaType || item.excerpt || item.duration || item.authorHandle)));

  const isSourceSection = /source/i.test(title);
  const addLabel = isSourceSection ? 'Add source' : `Add to ${title.toLowerCase()}`;

  return (
    <section aria-label={title} className={cx('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
          {subtitle && <p className="m-0 text-[15px] leading-[21px] text-grey-04">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
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

          <AddEntityItemPopover
            label={addLabel}
            primaryLabel={isSourceSection ? 'Source title' : 'Title'}
            primaryPlaceholder={isSourceSection ? 'e.g. UN OCHA Situation Report' : `Add ${title.toLowerCase()}...`}
            secondaryLabel={isSourceSection ? 'Publisher (optional)' : 'Details (optional)'}
            secondaryPlaceholder={isSourceSection ? 'e.g. UN OCHA · Nov 2026' : 'Date or short summary...'}
            tertiaryLabel={isSourceSection ? 'URL (optional)' : undefined}
            tertiaryPlaceholder={isSourceSection ? 'https://...' : undefined}
            onSubmit={draft => {
              const newItem: EntityLinkRowModel = {
                id: `user-${section.id}-${Date.now()}`,
                kind: isSourceSection ? 'source' : (allItems[0]?.kind ?? 'case'),
                kindLabel: isSourceSection ? 'Source' : (allItems[0]?.kindLabel ?? 'Item'),
                mediaType: isSourceSection ? 'article' : undefined,
                title: draft.primary,
                publisher: isSourceSection ? draft.secondary : undefined,
                meta: draft.secondary,
                externalUrl: draft.tertiary,
              };
              setAddedItems(prev => [newItem, ...prev]);
            }}
          />
        </div>
      </div>

      {allItems.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-grey-02 px-5 py-4 text-[15px] text-grey-04">
          {emptyText}
        </p>
      ) : useCards ? (
        <div className="grid grid-cols-1 items-start gap-4 @[640px]:grid-cols-2">
          {allItems.map(item => (
            <RichMediaCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className={cx('divide-y divide-divider overflow-hidden', TEMPLATE_CARD_SURFACE)}>
          {allItems.map(item => (
            <RelatedListRow key={item.id} item={item} showKindBadge={isMixedList && !item.avatarPair} />
          ))}
        </div>
      )}
    </section>
  );
}

function SourceQuoteBlock({ quote }: { quote: SourceQuoteModel }) {
  const attribution = [quote.speaker, quote.location].filter(Boolean).join(', ');
  return (
    <blockquote className="m-0 rounded-lg bg-grey-01/75 px-3.5 py-2.5 text-[14px] leading-[20px] text-text/90">
      <p className="m-0 line-clamp-3">“{quote.text}”</p>
      {attribution && <footer className="mt-1.5 text-[12.5px] text-grey-04">— {attribution}</footer>}
    </blockquote>
  );
}

function CardClickable({
  item,
  className,
  children,
}: {
  item: EntityLinkRowModel;
  className?: string;
  children: React.ReactNode;
}) {
  if (!item.plain && item.href) {
    return (
      <Link href={item.href} className={cx('group/link block text-left text-text no-underline', className)}>
        {children}
      </Link>
    );
  }
  if (!item.plain && item.onSelect) {
    return (
      <button
        type="button"
        onClick={item.onSelect}
        className={cx(
          'group/link block w-full cursor-pointer border-0 bg-transparent p-0 text-left text-text',
          className
        )}
      >
        {children}
      </button>
    );
  }
  if (!item.plain && item.externalUrl) {
    return (
      <a
        href={item.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cx('group/link block text-left text-text no-underline', className)}
      >
        {children}
      </a>
    );
  }
  return <div className={className}>{children}</div>;
}

function RichMediaCard({ item }: { item: EntityLinkRowModel }) {
  const mediaType = inferMediaType(item);
  const leadQuote = item.quotes?.[0];
  const cardClasses = cx(
    'flex w-full flex-col justify-between gap-3.5 p-5 text-left text-text',
    TEMPLATE_INTERACTIVE_CARD_SURFACE
  );

  const overflow = !item.plain ? (
    <EntityOverflowMenu target={{ id: item.id, kind: item.kindLabel || 'Source', title: item.title }} />
  ) : null;

  if (mediaType === 'video') {
    return (
      <article className={cardClasses}>
        <div className="flex flex-col gap-3">
          <CardClickable item={item}>
            <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-lg bg-grey-01">
              {item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-grey-04">
                  <span className="inline-grid size-11 place-items-center rounded-full bg-text text-white transition-transform group-hover/link:scale-105">
                    <PlayIcon className="ml-0.5 size-5" />
                  </span>
                </div>
              )}
              {item.thumbnailUrl && (
                <span className="absolute inline-grid size-11 place-items-center rounded-full bg-text/90 text-white shadow-card transition-transform group-hover/link:scale-105">
                  <PlayIcon className="ml-0.5 size-5" />
                </span>
              )}
              {item.duration && (
                <span className="absolute right-2.5 bottom-2.5 rounded-md bg-text/85 px-2 py-0.5 text-[13px] font-medium text-white tabular-nums">
                  {item.duration}
                </span>
              )}
            </div>
          </CardClickable>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[14px] text-grey-04">
                <PlayIcon className="size-3.5 text-purple" />
                <span className="truncate">
                  {[item.publisher, item.date].filter(Boolean).join(' · ') || item.meta || 'Video'}
                </span>
              </span>
              {overflow}
            </div>

            <CardClickable item={item}>
              <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text transition-colors group-hover/link:text-[#4c1fd4]">
                {item.title}
              </h3>
              {item.excerpt && (
                <p className="m-0 mt-1 line-clamp-2 text-[15px] leading-[22px] text-grey-04">{item.excerpt}</p>
              )}
            </CardClickable>
          </div>

          {leadQuote && <SourceQuoteBlock quote={leadQuote} />}
          <EntityInlineContext targetId={item.id} targetTitle={item.title} targetKind={item.kindLabel || 'Source'} />
        </div>
      </article>
    );
  }

  if (mediaType === 'tweet') {
    return (
      <article className={cardClasses}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardClickable item={item} className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-grid size-8 shrink-0 place-items-center rounded-full bg-grey-01 text-text">
                  <TweetIcon className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] leading-[19px] font-semibold text-text group-hover/link:text-[#4c1fd4]">
                    {item.publisher ?? item.title}
                  </span>
                  {item.authorHandle && (
                    <span className="truncate text-[14px] leading-[18px] text-grey-04">{item.authorHandle}</span>
                  )}
                </div>
              </div>
            </CardClickable>

            <div className="flex shrink-0 items-center gap-1.5">
              {item.date && <span className="text-[14px] text-grey-04">{item.date}</span>}
              {overflow}
            </div>
          </div>

          <CardClickable item={item}>
            <p className="m-0 text-[15px] leading-[23px] text-text">{item.excerpt ?? item.title}</p>
          </CardClickable>

          {leadQuote && <SourceQuoteBlock quote={leadQuote} />}
          <EntityInlineContext targetId={item.id} targetTitle={item.title} targetKind={item.kindLabel || 'Source'} />
        </div>

        <div className="flex items-center justify-between border-t border-divider pt-2.5 text-[14px] text-grey-04">
          <span>{item.meta ?? 'Social post'}</span>
          <CardClickable item={item} className="inline-flex !w-auto shrink-0 items-center text-grey-03 hover:text-text">
            <ArrowUpRightIcon className="size-4" />
          </CardClickable>
        </div>
      </article>
    );
  }

  // Article, Report, Court Document, or Dataset
  const eyebrow = [item.publisher, item.date].filter(Boolean).join(' · ') || item.meta;
  return (
    <article className={cardClasses}>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2 text-[14px] text-grey-04">
            <MediaIcon type={mediaType} />
            <span className="truncate font-medium">{eyebrow || item.kindLabel}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {overflow}
            <CardClickable
              item={item}
              className="inline-grid size-7 !w-7 shrink-0 place-items-center rounded-full text-grey-03 hover:text-text"
            >
              <ArrowUpRightIcon className="size-4" />
            </CardClickable>
          </div>
        </div>

        <CardClickable item={item}>
          <h3 className="m-0 text-[18px] leading-[24px] font-semibold text-text transition-colors group-hover/link:text-[#4c1fd4]">
            {item.title}
          </h3>
          {item.excerpt && (
            <p className="m-0 mt-1 line-clamp-2 text-[15px] leading-[22px] text-grey-04">{item.excerpt}</p>
          )}
        </CardClickable>

        {leadQuote && <SourceQuoteBlock quote={leadQuote} />}
        <EntityInlineContext targetId={item.id} targetTitle={item.title} targetKind={item.kindLabel || 'Source'} />
      </div>

      {!item.excerpt && !leadQuote && item.meta && item.publisher && (
        <span className="text-[14px] text-grey-04">{item.meta}</span>
      )}
    </article>
  );
}

function RelatedListRow({ item, showKindBadge }: { item: EntityLinkRowModel; showKindBadge: boolean }) {
  const rowClasses = cx(
    'flex w-full items-center gap-3 px-5 py-4 text-left text-text transition-colors',
    !item.plain && (item.href || item.onSelect) && 'hover:bg-bg'
  );

  const mainContent = (
    <>
      {item.avatarPair && (
        <span className="flex shrink-0 -space-x-2">
          <img src={item.avatarPair[0]} alt="" className="size-8 rounded-full border-2 border-white object-cover" />
          <img src={item.avatarPair[1]} alt="" className="size-8 rounded-full border-2 border-white object-cover" />
        </span>
      )}

      {showKindBadge && <TemplateBadge tone={LINK_KIND_TONE[item.kind]}>{item.kindLabel}</TemplateBadge>}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px] leading-[23px] font-medium text-text transition-colors group-hover/row:text-[#4c1fd4]">
          {item.title}
        </span>
        {item.meta && <span className="text-[15px] leading-[20px] text-grey-04">{item.meta}</span>}
      </span>

      {!item.plain && (item.href || item.onSelect) && <ChevronRightIcon className="size-4 shrink-0 text-grey-03" />}
    </>
  );

  return (
    <div className={rowClasses}>
      {!item.plain && item.href ? (
        <Link href={item.href} className="group/row flex min-w-0 flex-1 items-center gap-3.5 text-text no-underline">
          {mainContent}
        </Link>
      ) : !item.plain && item.onSelect ? (
        <button
          type="button"
          onClick={item.onSelect}
          className="group/row flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 border-0 bg-transparent p-0 text-left text-text"
        >
          {mainContent}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3.5">{mainContent}</div>
      )}

      {!item.plain && (
        <EntityOverflowMenu target={{ id: item.id, kind: item.kindLabel || item.kind, title: item.title }} />
      )}
    </div>
  );
}
