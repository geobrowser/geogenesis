'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { ContextPeekItemModel } from '../models';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  ArticleIcon,
  ChevronRightIcon,
  CloseIcon,
  DatasetIcon,
  DocumentIcon,
  PlayIcon,
  TweetIcon,
} from './icons';
import { SplitBars } from './split-bars';
import { TemplateBadge } from './template-shell';

export interface ContextPeekDrawerProps {
  item: ContextPeekItemModel | null;
  canGoBack?: boolean;
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
}

function PeekMediaIcon({ type }: { type?: ContextPeekItemModel['mediaType'] }) {
  switch (type) {
    case 'video':
      return <PlayIcon className="size-4 text-purple" />;
    case 'tweet':
      return <TweetIcon className="size-4 text-text" />;
    case 'dataset':
      return <DatasetIcon className="size-4 text-ctaPrimary" />;
    case 'article':
      return <ArticleIcon className="size-4 text-ctaPrimary" />;
    case 'document':
      return <DocumentIcon className="size-4 text-grey-04" />;
    default:
      return null;
  }
}

/**
 * Right-hand slide-over Context Peek Drawer.
 *
 * Lets readers verify a cited source, inspect an actor/entity's graph relations, or check an
 * event/story without losing scroll position on the active Topic or Claim page.
 */
export function ContextPeekDrawer({ item, canGoBack, backLabel, onBack, onClose }: ContextPeekDrawerProps) {
  React.useEffect(() => {
    if (!item) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-100 flex justify-end" role="dialog" aria-modal="true" aria-label={item.title}>
      {/* Subtle scrim */}
      <button
        type="button"
        aria-label="Close context drawer"
        onClick={onClose}
        className="fixed inset-0 cursor-default border-0 bg-black/15 backdrop-blur-[1px]"
      />

      {/* Drawer sheet */}
      <aside className="relative z-10 flex h-full w-full max-w-[500px] flex-col bg-white shadow-[-16px_0_48px_rgba(0,0,0,0.12)]">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {canGoBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[14px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <ArrowLeftIcon className="size-3.5" />
                <span>{backLabel ? `Back to ${backLabel}` : 'Back'}</span>
              </button>
            )}
            <TemplateBadge tone={item.kind === 'claim' ? 'split' : 'neutral'}>{item.kindLabel}</TemplateBadge>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 cursor-pointer place-items-center rounded-full border border-transparent bg-grey-01 text-text transition-colors hover:bg-divider"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-2.5">
            {item.subtitle && (
              <span className="inline-flex items-center gap-1.5 text-[14.5px] font-medium text-grey-04">
                <PeekMediaIcon type={item.mediaType} />
                <span>{item.subtitle}</span>
              </span>
            )}
            <h2 className="m-0 text-[24px] leading-[30px] font-semibold text-pretty text-text">{item.title}</h2>

            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {item.tags.map(tag => (
                  <TemplateBadge key={tag} tone="neutral">
                    {tag}
                  </TemplateBadge>
                ))}
              </div>
            )}
          </div>

          {item.summary && <p className="m-0 text-[15px] leading-[23px] text-text/85">{item.summary}</p>}

          {item.externalUrl && (
            <a
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 self-start rounded-full border border-text bg-text px-5 text-[15px] font-medium text-white no-underline transition-opacity hover:opacity-90"
            >
              <span>{item.externalLabel ?? 'Open source'}</span>
              <ArrowUpRightIcon className="size-4" />
            </a>
          )}

          {item.split && item.split.rows.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl bg-grey-01/70 p-4">
              <SplitBars rows={item.split.rows} density="compact" />
            </div>
          )}

          {item.metadata && item.metadata.length > 0 && (
            <dl className="m-0 grid grid-cols-2 gap-4 border-y border-divider py-4">
              {item.metadata.map(entry => (
                <div key={entry.label} className="flex flex-col gap-0.5">
                  <dt className="text-[13px] text-grey-04">{entry.label}</dt>
                  <dd className="m-0 text-[15px] font-semibold text-text">{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {item.relations && item.relations.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <span className="text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                Connected in the graph ({item.relations.length})
              </span>
              <div className="flex flex-col divide-y divide-divider rounded-xl border border-black/[0.04] bg-bg px-4">
                {item.relations.map(rel => (
                  <button
                    key={`${rel.id}-${rel.predicate}`}
                    type="button"
                    onClick={rel.onSelect}
                    className={cx(
                      'group flex w-full items-center justify-between gap-3 border-0 bg-transparent py-3 text-left',
                      rel.onSelect && 'cursor-pointer'
                    )}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-[13px] text-grey-04">{rel.predicate}</span>
                      <span className="text-[15.5px] font-semibold text-text group-hover:text-ctaPrimary">
                        {rel.targetName}
                      </span>
                      {rel.note && <span className="text-[13.5px] text-grey-04">{rel.note}</span>}
                    </span>
                    {rel.onSelect && <ChevronRightIcon className="size-4 text-grey-03 group-hover:text-ctaPrimary" />}
                  </button>
                ))}
              </div>
            </section>
          )}

          {item.claims && item.claims.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <span className="text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
                Linked claims ({item.claims.length})
              </span>
              <div className="flex flex-col gap-2.5">
                {item.claims.map(claim => (
                  <div key={claim.id} className="flex flex-col gap-2 rounded-xl bg-grey-01/65 p-3.5">
                    {claim.href ? (
                      <Link
                        href={claim.href}
                        onClick={onClose}
                        className="text-[15px] leading-[21px] font-semibold text-text no-underline hover:text-ctaPrimary"
                      >
                        {claim.title}
                      </Link>
                    ) : claim.onSelect ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          claim.onSelect?.();
                        }}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] leading-[21px] font-semibold text-text hover:text-ctaPrimary"
                      >
                        {claim.title}
                      </button>
                    ) : (
                      <span className="text-[15px] leading-[21px] font-semibold text-text">{claim.title}</span>
                    )}
                    <SplitBars rows={claim.split.rows} density="compact" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky footer CTA */}
        {(item.fullHref || item.onOpenFull) && (
          <div className="flex items-center justify-end border-t border-divider bg-white px-6 py-3.5">
            {item.fullHref ? (
              <Link
                href={item.fullHref}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-ctaPrimary no-underline hover:text-ctaHover"
              >
                <span>{item.openFullLabel ?? 'Open full page'}</span>
                <ArrowRightIcon className="size-4" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  item.onOpenFull?.();
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                <span>{item.openFullLabel ?? 'Open full page'}</span>
                <ArrowRightIcon className="size-4" />
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
