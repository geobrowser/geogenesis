'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { EntityLinkKind, EntityLinkRowModel, EntityListSectionModel } from '../models';
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

export interface RelatedListSectionProps {
  section: EntityListSectionModel;
  className?: string;
}

/**
 * Structured list of related entities (Claims, Events, Coverage, Sources, Debates, Cited by).
 *
 * Follows Finding G9 from the prototype audit: type badges are rendered ONLY when a list mixes
 * entity kinds, avoiding repetitive identical pills on homogeneous lists like "Sources".
 */
export function RelatedListSection({ section, className }: RelatedListSectionProps) {
  const { title, items, emptyText = 'Nothing linked yet.', action } = section;
  const isMixedList = items.length > 1 && items.some(item => item.kind !== items[0]?.kind);

  return (
    <section aria-label={title} className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-smallTitle text-text">{title}</h2>
        {action &&
          (action.href ? (
            <Link
              href={action.href}
              className="text-[13px] font-medium whitespace-nowrap text-ctaPrimary no-underline hover:text-ctaHover"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium whitespace-nowrap text-ctaPrimary hover:text-ctaHover"
            >
              {action.label}
            </button>
          ))}
      </div>

      {items.length === 0 ? (
        <p className="m-0 rounded-lg border border-dashed border-grey-02 px-4 py-3 text-[13px] text-grey-04">
          {emptyText}
        </p>
      ) : (
        <div className="divide-y divide-divider overflow-hidden rounded-xl border border-grey-02/70 bg-white">
          {items.map(item => (
            <RelatedListRow key={item.id} item={item} showKindBadge={isMixedList && !item.avatarPair} />
          ))}
        </div>
      )}
    </section>
  );
}

function RelatedListRow({ item, showKindBadge }: { item: EntityLinkRowModel; showKindBadge: boolean }) {
  const rowClasses = cx(
    'flex w-full items-center gap-3 px-4 py-3 text-left text-text no-underline transition-colors',
    !item.plain && (item.href || item.onSelect) && 'hover:bg-grey-01/70'
  );

  const inner = (
    <>
      {item.avatarPair && (
        <span className="flex shrink-0 -space-x-2">
          <img src={item.avatarPair[0]} alt="" className="h-7 w-7 rounded-full border-2 border-white object-cover" />
          <img src={item.avatarPair[1]} alt="" className="h-7 w-7 rounded-full border-2 border-white object-cover" />
        </span>
      )}

      {showKindBadge && <TemplateBadge tone={LINK_KIND_TONE[item.kind]}>{item.kindLabel}</TemplateBadge>}

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] leading-[20px] font-medium text-text">{item.title}</span>
        {item.meta && <span className="text-[13px] leading-[18px] text-grey-04">{item.meta}</span>}
      </span>

      {!item.plain && (item.href || item.onSelect) && (
        <span aria-hidden className="shrink-0 text-[15px] text-grey-03">
          ›
        </span>
      )}
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
