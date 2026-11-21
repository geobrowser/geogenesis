'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { BreadcrumbItem } from '../models';

export type TemplateBadgeTone =
  'neutral' | 'split' | 'agreed' | 'fact' | 'judgment' | 'value' | 'event' | 'story' | 'source' | 'post' | 'dark';

const BADGE_TONE_CLASSES: Record<TemplateBadgeTone, string> = {
  neutral: 'bg-grey-01 text-grey-05',
  split: 'bg-red-02 text-red-01',
  agreed: 'bg-successTertiary text-[#127a5b]',
  fact: 'bg-ctaTertiary text-[#1d5fbf]',
  judgment: 'bg-purple-tint text-purple',
  value: 'bg-[#fff4e6] text-[#a55a00]',
  event: 'bg-grey-01 text-grey-05',
  story: 'bg-ctaTertiary text-ctaPrimary',
  source: 'bg-grey-01 text-grey-04',
  post: 'bg-[#eef4fb] text-[#245a8a]',
  dark: 'bg-text text-white',
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
        'inline-flex h-[22px] items-center rounded-sm px-2 text-[12px] leading-none font-semibold whitespace-nowrap',
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
            {index > 0 && (
              <span aria-hidden className="text-metadata text-grey-03">
                ›
              </span>
            )}
            {item.href && !isLast ? (
              <Link href={item.href} className="text-metadata text-grey-04 transition-colors hover:text-text">
                {item.label}
              </Link>
            ) : item.onSelect && !isLast ? (
              <button
                type="button"
                onClick={item.onSelect}
                className="cursor-pointer border-0 bg-transparent p-0 text-metadata text-grey-04 transition-colors hover:text-text"
              >
                {item.label}
              </button>
            ) : (
              <span
                aria-current={isLast ? 'page' : undefined}
                className={cx('text-metadata', isLast ? 'font-medium text-text' : 'text-grey-04')}
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
 *
 * Uses `@container` rather than viewport breakpoints so full routes, the entity side panel,
 * and mobile viewports all adapt cleanly to their actual column width.
 */
export function TemplateShell({
  children,
  maxWidth = 840,
  breadcrumbs,
  className,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  breadcrumbs?: readonly BreadcrumbItem[];
  className?: string;
}) {
  return (
    <div className="@container">
      <div
        className={cx(
          'mx-auto flex w-full flex-col gap-6 px-4 py-6 @[560px]:gap-8 @[560px]:px-5 @[560px]:py-8',
          className
        )}
        style={{ maxWidth }}
      >
        {breadcrumbs && breadcrumbs.length > 0 && <TemplateBreadcrumb items={breadcrumbs} />}
        {children}
      </div>
    </div>
  );
}
