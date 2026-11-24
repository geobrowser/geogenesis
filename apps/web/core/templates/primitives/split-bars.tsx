'use client';

import * as React from 'react';

import cx from 'classnames';
import Link from 'next/link';

import { type SplitRow, formatCompactCount, formatPercentInt } from '../models';

export interface SplitBarsProps {
  rows: readonly SplitRow[];
  /** Compact mode fits inside cards/rows; full mode shows voter counts and taller tracks. */
  density?: 'compact' | 'full';
  className?: string;
}

/**
 * Horizontal per-community agreement (or helpfulness) bars sized to Geo's Calibre typography scale.
 */
export function SplitBars({ rows, density = 'compact', className }: SplitBarsProps) {
  if (rows.length === 0) return null;

  const isFull = density === 'full';

  return (
    <div className={cx('flex min-w-0 flex-col', isFull ? 'gap-3.5' : 'gap-2', className)}>
      {rows.map(row => {
        const clamped = Math.max(0, Math.min(100, row.percent));
        const percentText = formatPercentInt(clamped);
        const unit = row.unit ?? 'agree';

        return (
          <div
            key={row.id}
            className={cx(
              'grid items-center',
              isFull
                ? // As in compact: the label gives way before the bar, which keeps 40px. With a 122px label
                  // minimum and a 0 bar minimum, a 320px phone drew no bar (GEO-3819). Wide rows still
                  // give the label its 156px before the bar takes the rest.
                  'grid-cols-[minmax(72px,156px)_minmax(40px,1fr)_auto] gap-3 text-[15px] leading-[20px]'
                : // The label gives way on a narrow row, but the bar keeps 40px: the label grows to 128px
                  // before the bar gets any space, so with a 0 minimum a phone row drew no bar at all.
                  'grid-cols-[minmax(64px,128px)_minmax(40px,1fr)_36px] gap-2.5 text-[13.5px] leading-[18px]',
              row.isEveryone ? 'text-text' : 'text-grey-04'
            )}
          >
            <span className={cx('flex min-w-0 items-center gap-2 truncate', row.isSubspace && 'pl-3')}>
              <span
                aria-hidden
                className={cx(
                  'inline-block shrink-0 rounded-full',
                  isFull ? (row.isSubspace ? 'size-2' : 'size-2.5') : row.isSubspace ? 'size-1.5' : 'size-2'
                )}
                style={{ backgroundColor: row.color }}
              />
              {row.href ? (
                <Link
                  href={row.href}
                  className={cx(
                    'truncate text-inherit no-underline transition-colors hover:text-text hover:underline',
                    row.isEveryone && 'font-medium text-text'
                  )}
                >
                  {row.label}
                </Link>
              ) : row.onSelect ? (
                <button
                  type="button"
                  onClick={row.onSelect}
                  className={cx(
                    'cursor-pointer truncate border-0 bg-transparent p-0 text-left text-inherit transition-colors hover:text-text hover:underline',
                    row.isEveryone && 'font-medium text-text'
                  )}
                >
                  {row.label}
                </button>
              ) : (
                <span className={cx('truncate', row.isEveryone && 'font-medium text-text')}>{row.label}</span>
              )}
            </span>

            <div
              role="meter"
              aria-label={`${row.label} ${unit}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(clamped)}
              className={cx('overflow-hidden rounded-full bg-grey-01', isFull ? 'h-2.5' : 'h-2')}
            >
              <div
                className="h-full rounded-full transition-[width] duration-200"
                style={{
                  width: `${clamped.toFixed(2)}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>

            <span className="flex items-center justify-end gap-2 whitespace-nowrap tabular-nums">
              <strong className="font-semibold text-text">{percentText}</strong>
              {isFull && row.voterCount !== undefined && (
                <span className="text-[14px] text-grey-04">({formatCompactCount(row.voterCount)})</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
