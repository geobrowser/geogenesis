'use client';

import * as React from 'react';

import cx from 'classnames';

import { GRAPH_KIND_LABELS } from '~/core/graph-explorer/graph-kinds';
import type { GraphKindFilter } from '~/core/graph-explorer/select-graph';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

const ROUND =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dbdbdb] text-[16px] text-text hover:border-text';

/** The design's top bar: Back, where you are, in-map search, kind chips, close. */
export function GraphTopBar({
  back,
  trail,
  search,
  kinds,
  kindFilter,
  onKindFilter,
  close,
}: {
  back: { label: string; onClick: () => void } | null;
  /** Names from the start of the walk to the centre, which is last. */
  trail: string[];
  search: React.ReactNode;
  /** Chips beside Everything; topics have none, they always stay on the map. */
  kinds: readonly GraphKindFilter[];
  kindFilter: GraphKindFilter;
  onKindFilter: (kind: GraphKindFilter) => void;
  close: { href: string; label: string } | null;
}) {
  const chips: GraphKindFilter[] = ['all', ...kinds.filter(kind => kind !== 'all' && kind !== 'topic')];
  return (
    <div className="relative z-[2] flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] bg-white px-4 py-3 md:gap-2 lg:flex-wrap">
      {back ? (
        <button type="button" aria-label={back.label} title={back.label} onClick={back.onClick} className={ROUND}>
          ←
        </button>
      ) : null}
      <nav
        aria-label="Your path"
        className="flex min-w-0 flex-1 items-center gap-[6px] overflow-hidden whitespace-nowrap md:order-3 md:basis-full"
      >
        {trail.slice(-4).map((name, index, shown) => {
          const current = index === shown.length - 1;
          return (
            <React.Fragment key={`${index}-${name}`}>
              {index > 0 && (
                <span aria-hidden className="text-[#b8b8b8]">
                  ›
                </span>
              )}
              <span
                aria-current={current ? 'location' : undefined}
                className={cx(
                  'max-w-[220px] truncate text-[13px]',
                  current ? 'font-semibold text-text' : 'text-[#606060]'
                )}
              >
                {name}
              </span>
            </React.Fragment>
          );
        })}
      </nav>
      {search}
      {chips.length > 1 && (
        <div role="group" aria-label="Show" className="flex gap-2 lg:order-6 lg:basis-full lg:overflow-x-auto">
          {chips.map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={kindFilter === kind}
              onClick={() => onKindFilter(kind)}
              className={cx(
                'inline-flex h-8 shrink-0 items-center rounded-full border px-[14px] text-[13px] font-medium whitespace-nowrap',
                kindFilter === kind ? 'border-text bg-text text-white' : 'border-[#dbdbdb] text-text hover:border-text'
              )}
            >
              {kind === 'all' ? 'Everything' : GRAPH_KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
      {close && (
        <Link href={close.href} aria-label={close.label} title={close.label} className={cx(ROUND, 'md:ml-auto')}>
          ×
        </Link>
      )}
    </div>
  );
}
