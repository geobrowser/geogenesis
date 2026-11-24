'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { BreadcrumbItem, EntityActionCallbacks, EntityContextDataModel } from '../models';
import { resolveTemplateImageUrl } from '../ontology';
import { EntityActionProvider } from './entity-overflow-menu';
import { ChevronRightIcon } from './icons';

/**
 * Shared Geo card surfaces: barely-there border + wide, silky ambient shadow
 * so cards float softly on white without harsh outlines.
 */
export const TEMPLATE_CARD_SURFACE =
  'rounded-xl border border-black/[0.025] bg-white shadow-[0_10px_36px_-6px_rgba(0,0,0,0.065),0_2px_10px_-2px_rgba(0,0,0,0.03)]';

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
}: {
  /** The title: an `h1`. */
  children: React.ReactNode;
  /** The type chips and meta shown under the title. */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <>
      {children}
      <div className="flex items-start justify-between gap-x-4">
        {meta && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">{meta}</div>}
        {/* As tall as one chip line (h-7), so the actions center on the first line even when chips wrap. */}
        {actions && <div className="ml-auto flex h-7 shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </>
  );
}

const BREADCRUMB_ANCESTOR = 'min-w-[6ch] max-w-[50%] shrink-[999] truncate text-[15px] leading-[20px]';

export function TemplateBreadcrumb({ items, className }: { items: readonly BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    // One line: ancestors give up their width first (down to half the row, then a few letters), so the
    // current page keeps its name and a chevron never wraps onto a line of its own.
    <nav aria-label="Breadcrumb" className={cx('flex min-w-0 items-center gap-x-1.5', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={item.id}>
            {index > 0 && <ChevronRightIcon className="size-3.5 shrink-0 text-grey-03" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                title={item.label}
                className={cx(BREADCRUMB_ANCESTOR, 'text-grey-04 no-underline transition-colors hover:text-text')}
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
                    ? 'max-w-[380px] min-w-0 truncate text-[15px] leading-[20px] font-medium text-text'
                    : cx(BREADCRUMB_ANCESTOR, 'text-grey-04')
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
          {!embedded && breadcrumbs && breadcrumbs.length > 0 && <TemplateBreadcrumb items={breadcrumbs} />}
          {children}
        </div>
      </div>
    </EntityActionProvider>
  );
}
