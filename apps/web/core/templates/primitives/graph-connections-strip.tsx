'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import type { GraphConnectionGroupModel } from '../models';
import { NetworkIcon } from './icons';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface GraphConnectionsStripProps {
  groups: readonly GraphConnectionGroupModel[];
  className?: string;
}

/**
 * High-signal typed relations bar surfacing how the active entity connects to actors, events,
 * sources, debates, and parent/child claims in Geo's knowledge graph.
 */
export function GraphConnectionsStrip({ groups, className }: GraphConnectionsStripProps) {
  const nonEmpty = groups.filter(group => group.items.length > 0);
  if (nonEmpty.length === 0) return null;

  return (
    <section
      aria-label="Connected in the graph"
      className={cx('flex flex-col gap-3 px-5 py-4', TEMPLATE_CARD_SURFACE, className)}
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.04em] text-grey-04 uppercase">
        <NetworkIcon className="size-4 text-purple" />
        <span>Connected in the graph</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {nonEmpty.map(group => (
          <div
            key={group.predicate}
            className="grid grid-cols-1 items-baseline gap-2 @[520px]:grid-cols-[84px_minmax(0,1fr)]"
          >
            <span className="text-[14px] font-medium text-grey-04">{group.predicate}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {group.items.map(item => {
                const classes =
                  'inline-flex h-8 max-w-[260px] items-center gap-1.5 rounded-full border border-black/[0.06] bg-grey-01/75 px-3 text-[14px] font-medium text-text no-underline transition-colors hover:border-ctaPrimary/40 hover:bg-ctaTertiary hover:text-ctaPrimary';

                if (item.href) {
                  return (
                    <Link key={item.id} href={item.href} className={classes}>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                }
                if (item.onSelect) {
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.onSelect}
                      className={cx(classes, 'cursor-pointer')}
                    >
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                }
                return (
                  <span key={item.id} className={classes}>
                    <span className="truncate">{item.label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
