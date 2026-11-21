'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { SourceChipModel, SourceMediaKind } from '../models';
import { ArticleIcon, DatasetIcon, DocumentIcon, PlayIcon, TweetIcon } from './icons';

export interface SourceChipListProps {
  sources: readonly SourceChipModel[];
  className?: string;
}

function MediaKindIcon({ kind }: { kind?: SourceMediaKind }) {
  switch (kind) {
    case 'video':
      return <PlayIcon className="size-3.5 text-purple" />;
    case 'tweet':
      return <TweetIcon className="size-3.5 text-text" />;
    case 'dataset':
      return <DatasetIcon className="size-3.5 text-ctaPrimary" />;
    case 'article':
      return <ArticleIcon className="size-3.5 text-grey-04" />;
    default:
      return <DocumentIcon className="size-3.5 text-grey-04" />;
  }
}

/**
 * Clean, readable inline citation chips (`1 · UNOSAT satellite damage assessment`).
 */
export function SourceChipList({ sources, className }: SourceChipListProps) {
  if (sources.length === 0) return null;

  const chipClasses =
    'inline-flex max-w-full items-center gap-2 rounded-lg border border-grey-02/80 bg-white px-3 py-1.5 text-[14px] leading-[19px] text-text no-underline transition-colors hover:border-text';

  return (
    <div className={cx('flex flex-wrap items-center gap-2', className)}>
      {sources.map(source => {
        const inner = (
          <>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-grey-04">
              {source.mediaType ? (
                <MediaKindIcon kind={source.mediaType} />
              ) : (
                <span className="text-[13px] font-semibold text-ctaPrimary tabular-nums">{source.index}</span>
              )}
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
