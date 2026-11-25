'use client';

import * as React from 'react';

import cx from 'classnames';
import { useSetAtom } from 'jotai';
import Link from 'next/link';

import type { BreadcrumbItem, EntityActionCallbacks, EntityContextDataModel } from '../models';
import { resolveTemplateImageUrl } from '../ontology';
import { EntityActionProvider } from './entity-overflow-menu';
import { ChevronRightIcon } from './icons';
import { entityTemplatePagesOnScreenAtom } from '~/atoms';

/**
 * Shared Geo card surfaces: barely-there border + wide, silky ambient shadow
 * so cards float softly on white without harsh outlines.
 */
export const TEMPLATE_CARD_SURFACE =
  'rounded-xl border border-black/[0.025] bg-white shadow-[0_10px_36px_-6px_rgba(0,0,0,0.065),0_2px_10px_-2px_rgba(0,0,0,0.03)]';

/**
 * The surface of a template claim list (Topic, Source, Episode, Post, a Claim's sub-claims). Wide
 * (760px+ template) it is the card; phones drop the card for hairlines above and below, so the rows
 * use the page's full width (Preston, GEO-3857). Rows pad themselves only on the wide card.
 */
export const TEMPLATE_CLAIM_LIST_SURFACE =
  'border-y border-divider bg-white @[760px]:rounded-xl @[760px]:border @[760px]:border-black/[0.025] @[760px]:shadow-[0_10px_36px_-6px_rgba(0,0,0,0.065),0_2px_10px_-2px_rgba(0,0,0,0.03)]';

export const TEMPLATE_INTERACTIVE_CARD_SURFACE =
  'rounded-xl border border-black/[0.025] bg-white shadow-[0_10px_36px_-6px_rgba(0,0,0,0.065),0_2px_10px_-2px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-[1.5px] hover:border-black/[0.05] hover:shadow-[0_18px_44px_-8px_rgba(0,0,0,0.095),0_4px_14px_-2px_rgba(0,0,0,0.04)]';

/**
 * Quiet, card-less empty state for optional entity sections (`Disputes`, `Sources`, `Context`).
 * Uses a whisper-thin top hairline rule + muted outline icon + calm copy so empty sections stay
 * clear and anchored to their heading without adding floating empty card boxes.
 */
export function TemplateEmptyState({
  children,
  icon,
  className,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-2 border-t border-divider/80 pt-3 text-[14px] text-grey-04', className)}>
      {icon && (
        <span aria-hidden className="inline-flex shrink-0 items-center text-grey-03">
          {icon}
        </span>
      )}
      <p className="m-0">{children}</p>
    </div>
  );
}

export type TemplateBadgeTone =
  | 'neutral'
  | 'split'
  | 'agreed'
  | 'fact'
  | 'judgment'
  | 'value'
  | 'event'
  | 'story'
  | 'podcast'
  | 'episode'
  | 'source'
  | 'post'
  | 'debate'
  | 'dark';

/**
 * Restrained Geo badge palette: predominantly clean white/grey/black with calm touches of
 * Geo Blue (`ctaPrimary`) and Geo Purple (`purple`).
 */
const BADGE_TONE_CLASSES: Record<TemplateBadgeTone, string> = {
  neutral: 'border border-divider bg-grey-01 text-grey-04',
  split: 'border border-purple/20 bg-purple-tint/70 text-purple',
  agreed: 'border border-grey-02 bg-white text-text',
  fact: 'border border-ctaPrimary/15 bg-ctaTertiary text-ctaPrimary',
  judgment: 'border border-purple/15 bg-purple-tint/60 text-purple',
  value: 'border border-grey-02 bg-grey-01 text-text',
  event: 'border border-divider bg-grey-01 text-grey-05',
  story: 'border border-ctaPrimary/15 bg-ctaTertiary text-ctaPrimary',
  podcast: 'border border-purple/15 bg-purple-tint/60 text-purple',
  episode: 'border border-purple/15 bg-purple-tint/60 text-purple',
  source: 'border border-divider bg-grey-01 text-grey-04',
  post: 'border border-purple/15 bg-purple-tint/60 text-purple',
  debate: 'border border-purple/15 bg-purple-tint/60 text-purple',
  dark: 'border border-text bg-text text-white',
};

export function TemplateBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: TemplateBadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-7 items-center rounded-md px-2.5 text-[14px] leading-none font-medium whitespace-nowrap',
        BADGE_TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * A template's title on its own full-width line, then the type row: the type chips (and any date or
 * meta) on the left, the header actions (votes, history, menu) right-aligned on the same line. Long chip
 * lists wrap inside their column, so the actions stay together beside the first chip line and nothing
 * overflows sideways. With no chips, the actions get their own right-aligned row under the title.
 *
 * Renders a fragment, so the spacing between the title and the type row is the parent's gap.
 */
export function TemplateTitleRow({
  children,
  meta,
  actions,
  singleLine = false,
}: {
  /** The title: an `h1`. */
  children: React.ReactNode;
  /** The type chips and meta shown under the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /**
   * Keeps the row to one line: chips that don't fit beside the actions drop to a second line, which
   * is clipped, so whole chips disappear from the end instead of wrapping.
   */
  singleLine?: boolean;
}) {
  return (
    <>
      {children}
      <div className="flex items-start justify-between gap-x-4">
        {meta && (
          <div
            className={cx(
              'flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5',
              singleLine && 'h-7 overflow-hidden'
            )}
          >
            {meta}
          </div>
        )}
        {/* As tall as one chip line (h-7), so the actions center on the first line even when chips wrap. */}
        {actions && <div className="ml-auto flex h-7 shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </>
  );
}

/**
 * Ancestors keep their natural width up to 45% of the row, and only they shrink when the row is full.
 * Phones show the parent alone, at full width (GEO-3837).
 */
const BREADCRUMB_ANCESTOR = 'min-w-0 truncate text-[15px] leading-[20px] @[600px]:max-w-[45%]';
/** Only the parent is shown on phones; every other crumb and chevron is desktop-only. */
const DESKTOP_ONLY = 'hidden @[600px]:block';

export function TemplateBreadcrumb({ items, className }: { items: readonly BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;
  const parentIndex = items.length - 2;

  return (
    // Desktop: one line, so a chevron never wraps onto a line of its own. The current page takes the
    // space the ancestors leave (at least 40% of the row; basis-0, so it never squeezes them), and
    // truncates. Phones: a single "‹ Parent" back link, since five crumbs squeezed into 360px are all
    // ellipses and the page title sits right below.
    <nav aria-label="Breadcrumb" className={cx('flex min-w-0 items-center gap-x-1.5', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isParent = index === parentIndex;
        const visibility = isParent ? undefined : DESKTOP_ONLY;
        return (
          <React.Fragment key={item.id}>
            {isParent && <ChevronRightIcon className="size-3.5 rotate-180 text-grey-04 @[600px]:hidden" />}
            {index > 0 && <ChevronRightIcon className="hidden size-3.5 shrink-0 text-grey-03 @[600px]:block" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                title={item.label}
                className={cx(
                  BREADCRUMB_ANCESTOR,
                  visibility,
                  'text-grey-04 no-underline transition-colors hover:text-text'
                )}
              >
                {item.label}
              </Link>
            ) : item.onSelect && !isLast ? (
              <button
                type="button"
                onClick={item.onSelect}
                title={item.label}
                className={cx(
                  BREADCRUMB_ANCESTOR,
                  visibility,
                  'cursor-pointer border-0 bg-transparent p-0 text-left text-grey-04 transition-colors hover:text-text'
                )}
              >
                {item.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                title={item.label}
                className={cx(
                  isLast
                    ? cx(
                        'min-w-[40%] flex-1 basis-0 truncate text-[15px] leading-[20px] font-medium text-text',
                        DESKTOP_ONLY
                      )
                    : cx(BREADCRUMB_ANCESTOR, visibility, 'text-grey-04')
                )}
              >
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/**
 * Tells the app a full entity page that uses a template is on screen (not the side panel or a Space
 * embed), which keeps the assistant's floating button off (GEO-3846). `TemplateShell` calls it, and so
 * does each live template view from its first render, so the button doesn't show while the page
 * loads and then vanish once the template draws.
 */
export function useEntityTemplatePageOnScreen(active: boolean) {
  const setTemplatePagesOnScreen = useSetAtom(entityTemplatePagesOnScreenAtom);
  React.useEffect(() => {
    if (!active) return;
    setTemplatePagesOnScreen(count => count + 1);
    return () => setTemplatePagesOnScreen(count => count - 1);
  }, [active, setTemplatePagesOnScreen]);
}

/**
 * Container-query wrapper shared by every v2 entity template.
 */
export function TemplateShell({
  children,
  maxWidth = 860,
  breadcrumbs,
  coverUrl,
  coverAlt = '',
  compact = false,
  embedded = false,
  contextByEntityId,
  actionCallbacks,
  className,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  breadcrumbs?: readonly BreadcrumbItem[];
  coverUrl?: string | null;
  coverAlt?: string;
  /** Tighten outer spacing and cover height when rendered inside the narrow entity side panel. */
  compact?: boolean;
  /** Omit outer max-width, horizontal padding, cover, and breadcrumbs when embedded inside a Space shell. */
  embedded?: boolean;
  contextByEntityId?: Readonly<Record<string, EntityContextDataModel>>;
  actionCallbacks?: EntityActionCallbacks;
  className?: string;
}) {
  const resolvedCoverUrl = embedded ? null : resolveTemplateImageUrl(coverUrl);

  useEntityTemplatePageOnScreen(!compact && !embedded);

  return (
    <EntityActionProvider initialContextByTarget={contextByEntityId} callbacks={actionCallbacks}>
      <div className="@container">
        {resolvedCoverUrl && (
          <div className={cx('mx-auto w-full', compact ? 'px-4 pt-4' : 'max-w-[1192px] px-5 pt-6 @[600px]:px-6')}>
            <div
              className={cx(
                'w-full overflow-hidden rounded-xl border border-black/[0.04] bg-grey-01',
                compact ? 'h-[156px]' : 'h-[180px] @[640px]:h-[260px]'
              )}
            >
              <img src={resolvedCoverUrl} alt={coverAlt} className="h-full w-full object-cover" />
            </div>
          </div>
        )}
        <div
          className={cx(
            'flex w-full flex-col',
            embedded
              ? 'gap-9 pt-1 pb-10'
              : cx(
                  'mx-auto',
                  compact ? 'gap-7 px-4 py-5' : 'gap-8 px-5 py-8 @[600px]:gap-11 @[600px]:px-6',
                  !compact && (resolvedCoverUrl ? '@[600px]:pt-7 @[600px]:pb-10' : '@[600px]:py-10')
                ),
            className
          )}
          style={compact || embedded ? undefined : { maxWidth }}
        >
          {!embedded && breadcrumbs && breadcrumbs.length > 0 && (
            // The trail sits closer to the cover and the title than the section gap (32px on phones,
            // 44px on desktop), so it reads as part of the header (GEO-3837).
            <TemplateBreadcrumb
              items={breadcrumbs}
              className={compact ? undefined : '-mt-3 -mb-4 @[600px]:-mt-2 @[600px]:-mb-6'}
            />
          )}
          {children}
        </div>
      </div>
    </EntityActionProvider>
  );
}
