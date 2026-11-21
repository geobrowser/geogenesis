'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { SourceChipModel } from '../models';

export interface SourceChipListProps {
  sources: readonly SourceChipModel[];
  className?: string;
}

/**
 * Compact numbered citation pills (`[1] UNOSAT satellite damage assessment`).
 */
export function SourceChipList({ sources, className }: SourceChipListProps) {
  if (sources.length === 0) return null;

  const chipClasses =
    'inline-flex max-w-full items-center gap-1.5 rounded-full border border-grey-02/80 bg-white px-2.5 py-1 text-[12px] leading-[16px] text-text no-underline transition-colors hover:border-text';

  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {sources.map(source => {
        const inner = (
          <>
            <span className="inline-grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-sm bg-ctaTertiary px-1 text-[11px] font-semibold text-ctaPrimary tabular-nums">
              {source.index}
            </span>
            <span className="truncate">{source.title}</span>
          </>
        );

        if (source.href) {
          return (
            <Link key={source.id} href={source.href} className={chipClasses}>
              {inner}
            </Link>
          );
        }

        if (source.onSelect) {
          return (
            <button
              key={source.id}
              type="button"
              onClick={source.onSelect}
              className={cx(chipClasses, 'cursor-pointer')}
            >
              {inner}
            </button>
          );
        }

        return (
          <span key={source.id} className={chipClasses}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
