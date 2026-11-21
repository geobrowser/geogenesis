'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { BreadcrumbItem } from '../models';
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

export type TemplateBadgeTone =
  | 'neutral'
  | 'split'
  | 'agreed'
  | 'fact'
  | 'judgment'
  | 'value'
  | 'event'
  | 'story'
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

export function TemplateBreadcrumb({ items, className }: { items: readonly BreadcrumbItem[]; className?: string }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-1', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={item.id}>
            {index > 0 && <ChevronRightIcon className="size-3.5 text-grey-03" />}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-[15px] leading-[20px] text-grey-04 no-underline transition-colors hover:text-text"
              >
                {item.label}
              </Link>
            ) : item.onSelect && !isLast ? (
              <button
                type="button"
                onClick={item.onSelect}
                className="cursor-pointer border-0 bg-transparent p-0 text-[15px] leading-[20px] text-grey-04 transition-colors hover:text-text"
              >
                {item.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={cx('text-[15px] leading-[20px]', isLast ? 'font-medium text-text' : 'text-grey-04')}
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
  className,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  breadcrumbs?: readonly BreadcrumbItem[];
  className?: string;
}) {
  return (
    <EntityActionProvider>
      <div className="@container">
        <div
          className={cx(
            'mx-auto flex w-full flex-col gap-8 px-5 py-8 @[600px]:gap-11 @[600px]:px-6 @[600px]:py-10',
            className
          )}
          style={{ maxWidth }}
        >
          {breadcrumbs && breadcrumbs.length > 0 && <TemplateBreadcrumb items={breadcrumbs} />}
          {children}
        </div>
      </div>
    </EntityActionProvider>
  );
}
