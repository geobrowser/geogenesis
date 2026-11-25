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
import { resolveTemplateImageUrl } from '../ontology';
import { TEMPLATE_ACTIONS } from '../template-actions';
import { EntityInlineContext, EntityOverflowMenu, InlinePagination } from './entity-overflow-menu';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArticleIcon,
  ChevronRightIcon,
  DatasetIcon,
  DocumentIcon,
  PlayIcon,
  TweetIcon,
} from './icons';
import { ListRankingHeaderControl, ListRankingWorkspace, type RankableListItem, useListRanking } from './list-ranking';
import { SourceIngestionPopover } from './source-ingestion-popover';
import {
  TEMPLATE_CARD_SURFACE,
  TEMPLATE_INTERACTIVE_CARD_SURFACE,
  TemplateBadge,
  type TemplateBadgeTone,
  TemplateEmptyState,
} from './template-shell';

const LINK_KIND_TONE: Record<EntityLinkKind, TemplateBadgeTone> = {
  claim: 'neutral',
  event: 'event',
  'news-story': 'story',
  podcast: 'podcast',
  episode: 'episode',
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
const LIST_PAGE_SIZE = 8;

export function RelatedListSection({ section, className }: RelatedListSectionProps) {
  const { title, subtitle, items, emptyText = 'Nothing linked yet.', action, layout } = section;
  const [page, setPage] = React.useState(1);
  const allItems = items;
  // The rows this section shows, so a pasted link that enriches one of them isn't linked a second
  // time (GEO-3819).
  const ingestionLink = React.useMemo(
    () => section.ingestionLink && { ...section.ingestionLink, listedEntityIds: items.map(item => item.id) },
    [section.ingestionLink, items]
  );
  const rankingKey = React.useMemo(() => {
    const sig = allItems
      .slice(0, 3)
      .map(item => item.id)
      .join(',');
    return `section:${section.id}:${title}:${sig}`;
  }, [allItems, section.id, title]);

  const ranking = useListRanking({ listKey: rankingKey, items: allItems });

  const rankableItems = React.useMemo<RankableListItem[]>(
    () =>
      allItems.map(item => ({
        id: item.id,
        title: item.title,
        subtitle: item.publisher ?? item.excerpt,
        badge: item.kindLabel && item.kindLabel !== 'Item' ? item.kindLabel : undefined,
        badgeTone: LINK_KIND_TONE[item.kind],
        meta: item.meta ?? item.duration,
        imageUrl: resolveTemplateImageUrl(item.thumbnailUrl ?? item.authorAvatarUrl),
      })),
    [allItems]
  );

  const orderedItems = ranking.orderedItems;
  const isMixedList = orderedItems.length > 1 && orderedItems.some(item => item.kind !== orderedItems[0]?.kind);
  const useCards =
    layout === 'cards' ||
    (layout !== 'list' &&
      orderedItems.some(item => Boolean(item.mediaType || item.excerpt || item.duration || item.authorHandle)));
  const totalPages = useCards ? 1 : Math.max(1, Math.ceil(orderedItems.length / LIST_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useCards
    ? orderedItems
    : orderedItems.slice((safePage - 1) * LIST_PAGE_SIZE, safePage * LIST_PAGE_SIZE);

  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [railNav, setRailNav] = React.useState({ left: false, right: false });

  React.useEffect(() => {
    if (!useCards) return;
    const scroller = railRef.current;
    if (!scroller) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = scroller.getBoundingClientRect();
      const cols = Array.from(scroller.querySelectorAll<HTMLElement>('[data-masonry-col]'));
      const firstBox = cols.at(0)?.getBoundingClientRect();
      const lastBox = cols.at(-1)?.getBoundingClientRect();
      const next = {
        left: Boolean(firstBox && firstBox.left < box.left - 1),
        right: Boolean(lastBox && lastBox.right > box.right + 1),
      };
      setRailNav(current => (current.left === next.left && current.right === next.right ? current : next));
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
  }, [orderedItems.length, useCards]);

  const scrollRailByColumn = React.useCallback((direction: -1 | 1) => {
    const scroller = railRef.current;
    if (!scroller) return;
    const firstCol = scroller.querySelector<HTMLElement>('[data-masonry-col]');
    const colWidth = firstCol?.getBoundingClientRect().width || 360;
    scroller.scrollBy({ left: direction * (colWidth + 16), behavior: 'smooth' });
  }, []);

  const isSourceSection = /source|evidence/i.test(title);
  const addLabel = 'Add source';

  return (
    <section aria-label={title} className={cx('flex flex-col gap-3', className)}>
      {/* One line at any width (GEO-3837): a long title wraps beside the actions instead of the
          actions dropping under it. */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-mediumTitle font-semibold text-text">{title}</h2>
          {subtitle && <p className="m-0 text-[15px] leading-[21px] text-grey-04">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action &&
            (action.href ? (
              <Link
                href={action.href}
                className="mr-1.5 inline-flex items-center gap-1 text-[15px] font-medium whitespace-nowrap text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>{action.label}</span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="mr-1.5 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[15px] font-medium whitespace-nowrap text-ctaPrimary hover:text-ctaHover"
              >
                <span>{action.label}</span>
              </button>
            ))}

          {useCards && allItems.length > 2 && (railNav.left || railNav.right) && (
            // Each arrow's ::after widens its tap target to 32px without changing how it looks.
            <div className="mr-1 flex items-center gap-1.5">
              <button
                type="button"
                aria-label={`Scroll ${title.toLowerCase()} left`}
                disabled={!railNav.left}
                onClick={() => scrollRailByColumn(-1)}
                className="relative inline-grid size-7 cursor-pointer place-items-center rounded-full border border-grey-02 bg-white text-text transition-colors after:absolute after:-inset-0.5 hover:border-text disabled:cursor-default disabled:border-divider disabled:text-grey-03"
              >
                <ArrowLeftIcon className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Scroll ${title.toLowerCase()} right`}
                disabled={!railNav.right}
                onClick={() => scrollRailByColumn(1)}
                className="relative inline-grid size-7 cursor-pointer place-items-center rounded-full border border-grey-02 bg-white text-text transition-colors after:absolute after:-inset-0.5 hover:border-text disabled:cursor-default disabled:border-divider disabled:text-grey-03"
              >
                <ArrowRightIcon className="size-3.5" />
              </button>
            </div>
          )}

          <ListRankingHeaderControl
            title={title}
            hasMyRanking={ranking.hasMyRanking}
            viewMode={ranking.viewMode}
            onViewModeChange={mode => {
              ranking.setViewMode(mode);
              setPage(1);
            }}
            onOpen={ranking.open}
            disabled={allItems.length < 2}
          />

          {/* Only Sources has a `+`: a pasted link becomes a source linked to this page through the same
              ingestion as the Add data panel (GEO-3819). Other sections have no entity type to publish a
              free-text row as, so they have none. */}
          {isSourceSection && TEMPLATE_ACTIONS.addSource && (
            <SourceIngestionPopover label={addLabel} link={ingestionLink} />
          )}
        </div>
      </div>

      <ListRankingWorkspace
        open={ranking.isOpen}
        title={title}
        subtitle={subtitle}
        items={rankableItems}
        initialOrder={ranking.myOrder}
        onClose={ranking.close}
        onPublish={nextOrder => {
          ranking.publish(nextOrder);
          setPage(1);
        }}
      />

      {allItems.length === 0 ? (
        <TemplateEmptyState>{emptyText}</TemplateEmptyState>
      ) : useCards ? (
        <HorizontalMasonryRail items={visibleItems} scrollerRef={railRef} />
      ) : (
        <div className={cx('divide-y divide-divider overflow-hidden', TEMPLATE_CARD_SURFACE)}>
          {visibleItems.map(item => (
            <RelatedListRow key={item.id} item={item} showKindBadge={isMixedList && !item.avatarPair} />
          ))}
          {totalPages > 1 && (
            <div className="px-5 py-3">
              <InlinePagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={setPage}
                label={`${title} pages`}
                className="pt-0"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function estimateCardWeight(item: EntityLinkRowModel): number {
  const mediaType = inferMediaType(item);
  let weight = 1;
  if (mediaType === 'video' || Boolean(item.thumbnailUrl)) weight += 1.4;
  if (item.quotes && item.quotes.length > 0) weight += 0.7;
  if ((item.excerpt?.length ?? 0) > 140) weight += 0.3;
  return weight;
}

/**
 * Column widths that fit a whole number of columns in the rail (`100cqw` is the rail's width).
 *
 * Fixed pixel widths cut the last visible card at whatever point the page width happened to put
 * it, often mid-word (GEO-3819). Here two or three columns fill the row exactly, so the next card
 * starts out of view and the arrows bring it in; on a phone one column takes 84% and the next one
 * peeks on purpose. `scroll-px-2` on the scroller makes each snap point line up with that grid.
 */
const RAIL_COLUMN_WIDTH_CLASS = 'w-[84cqw] @[540px]:w-[calc((100cqw-1rem)/2)] @[1000px]:w-[calc((100cqw-2rem)/3)]';

/**
 * Horizontally scrollable masonry rail:
 * - For 1–3 cards (e.g. News story Sources), renders a single horizontal snap-scroll row with
 *   one card per column (widths from `RAIL_COLUMN_WIDTH_CLASS`).
 * - For 4+ cards (e.g. Topic `Evidence`), packs cards into balanced 2-card vertical
 *   masonry columns inside a horizontal snap-scroll strip so tall media cards never leave awkward
 *   vertical whitespace AND users can smoothly swipe or click `←` `→` horizontally through all cards.
 */
function HorizontalMasonryRail({
  items,
  scrollerRef,
}: {
  items: readonly EntityLinkRowModel[];
  scrollerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const columns = React.useMemo<EntityLinkRowModel[][]>(() => {
    if (items.length <= 3) {
      return items.map(item => [item]);
    }
    const colCount = Math.ceil(items.length / 2);
    const cols: EntityLinkRowModel[][] = Array.from({ length: colCount }, () => []);
    const weights = new Array<number>(colCount).fill(0);

    // Pack greedily into the lightest column that still has < 2 cards so every column stays balanced
    for (const item of items) {
      let bestIdx = 0;
      let bestWeight = Infinity;
      for (let i = 0; i < colCount; i++) {
        if (cols[i]!.length >= 2) continue;
        if (weights[i]! < bestWeight) {
          bestWeight = weights[i]!;
          bestIdx = i;
        }
      }
      cols[bestIdx]!.push(item);
      weights[bestIdx]! += estimateCardWeight(item);
    }

    return cols.filter(col => col.length > 0);
  }, [items]);

  return (
    <div className="@container relative">
      <div
        ref={scrollerRef}
        className="-mx-2 flex snap-x snap-mandatory scroll-px-2 [scrollbar-width:none] items-start gap-4 overflow-x-auto px-2 py-2 [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {columns.map((colItems, colIdx) => (
          <div
            key={colItems[0]?.id ?? colIdx}
            data-masonry-col
            className={cx('flex shrink-0 snap-start flex-col gap-4', RAIL_COLUMN_WIDTH_CLASS)}
          >
            {colItems.map(item => (
              <RichMediaCard key={item.id} item={item} />
            ))}
          </div>
        ))}
      </div>
    </div>
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

function TweetAuthorAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const resolved = resolveTemplateImageUrl(avatarUrl);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [resolved]);

  const initials = name
    .replace(/^@/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span className="relative inline-grid size-9 shrink-0 place-items-center rounded-full border border-black/[0.06] bg-grey-01 text-text">
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : initials ? (
        <span className="text-[12.5px] font-semibold text-grey-05">{initials}</span>
      ) : (
        <TweetIcon className="size-4" />
      )}
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 inline-grid size-4 place-items-center rounded-full border border-white bg-text text-white"
      >
        <TweetIcon className="size-2.5" />
      </span>
    </span>
  );
}

function RichMediaCard({ item }: { item: EntityLinkRowModel }) {
  const mediaType = inferMediaType(item);
  const leadQuote = item.quotes?.[0];
  const resolvedThumb = resolveTemplateImageUrl(item.thumbnailUrl);
  const cardClasses = cx('flex w-full flex-col gap-3 p-5 text-left text-text', TEMPLATE_INTERACTIVE_CARD_SURFACE);

  const overflow = !item.plain ? (
    <EntityOverflowMenu target={{ id: item.id, kind: item.kindLabel || 'Source', title: item.title }} />
  ) : null;

  if (mediaType === 'video') {
    return (
      <article className={cardClasses}>
        <div className="flex flex-col gap-3">
          <CardClickable item={item}>
            <div className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-lg bg-grey-01">
              {resolvedThumb ? (
                <img src={resolvedThumb} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-grey-04">
                  <span className="inline-grid size-11 place-items-center rounded-full bg-text text-white transition-transform group-hover/link:scale-105">
                    <PlayIcon className="ml-0.5 size-5" />
                  </span>
                </div>
              )}
              {resolvedThumb && (
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
    const accountName =
      item.publisher && item.publisher !== 'Tweet' && item.publisher !== 'Post'
        ? item.publisher
        : item.authorHandle || item.publisher || item.title;
    const secondaryHandle =
      item.authorHandle && item.authorHandle.toLowerCase() !== accountName.toLowerCase()
        ? item.authorHandle
        : undefined;

    return (
      <article className={cardClasses}>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardClickable item={item} className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <TweetAuthorAvatar name={accountName} avatarUrl={item.authorAvatarUrl} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] leading-[19px] font-semibold text-text group-hover/link:text-[#4c1fd4]">
                    {accountName}
                  </span>
                  {/* The date sits under the name with the handle (as on X), not beside the actions,
                      so a narrow card doesn't cut the name to a few letters. */}
                  {(secondaryHandle || item.date) && (
                    <span className="truncate text-[13.5px] leading-[17px] text-grey-04">
                      {[secondaryHandle, item.date].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
              </div>
            </CardClickable>

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
            <p className="m-0 line-clamp-4 text-[15px] leading-[23px] text-text">{item.excerpt ?? item.title}</p>
          </CardClickable>

          {leadQuote && <SourceQuoteBlock quote={leadQuote} />}
          <EntityInlineContext targetId={item.id} targetTitle={item.title} targetKind={item.kindLabel || 'Source'} />
        </div>
      </article>
    );
  }

  // Article, Report, Court Document, or Dataset
  const eyebrow = [item.publisher, item.date].filter(Boolean).join(' · ') || item.meta;
  return (
    <article className={cardClasses}>
      <div className="flex flex-col gap-2.5">
        {resolvedThumb && (
          <CardClickable item={item}>
            <div className="aspect-[16/9] w-full overflow-hidden rounded-lg bg-grey-01">
              <img src={resolvedThumb} alt={item.title} className="h-full w-full object-cover" />
            </div>
          </CardClickable>
        )}
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
        {item.meta && <span className="line-clamp-2 text-[15px] leading-[21px] text-grey-04">{item.meta}</span>}
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
