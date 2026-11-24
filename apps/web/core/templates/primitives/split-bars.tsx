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
                ? 'grid-cols-[minmax(122px,156px)_minmax(0,1fr)_auto] gap-3 text-[15px] leading-[20px]'
                : // The label gives way before the bar and percentage on a narrow row; at full width it
                  // still takes up to 128px first.
                  'grid-cols-[minmax(64px,128px)_minmax(0,1fr)_36px] gap-2.5 text-[13.5px] leading-[18px]',
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
              {/* Full density only: the compact grid's last column is 36px, so the label spilled over the
                  bar and the next column (GEO-3819). Compact rows sit beside pills that show the vote. */}
              {isFull && row.userLabel && (
                <span className="rounded-md bg-grey-01 px-2 py-0.5 text-[13px] font-medium text-text">
                  {row.userLabel}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
