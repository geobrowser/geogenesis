'use client';

import * as React from 'react';

import cx from 'classnames';

import { Skeleton } from '~/design-system/skeleton';

import { SpaceThumb } from './hub-facet-rail';
import { HubPillButton } from './hub-pill-button';
import { formatFacetCount } from './topic-facets';

/**
 * One filter option as a pill: its name and its count, with a space's picture before them. Dark
 * while picked, and `aria-pressed` to say so.
 *
 * Shared by the calendar's space row (`SpaceFilterPills`) and the debate again picker's row of
 * spaces and topics (`FacetFilterPills`), which have to read as the same control.
 */
export function FacetPill({
  picked,
  label,
  fallbackLabel,
  space,
  count,
  countsPending = false,
  className,
  ...buttonProps
}: {
  picked: boolean;
  /** The option's name; `null` while a space's is still on its way, which draws as a skeleton. */
  label: string | null;
  /** What to call an option whose name never arrived. */
  fallbackLabel: string;
  /** Present for a space, whose picture leads the pill. */
  space?: { id: string; image: string | null };
  count: number;
  /** The count answers a filter that has since changed. */
  countsPending?: boolean;
} & Omit<React.ComponentProps<typeof HubPillButton>, 'variant' | 'aria-pressed' | 'children'>) {
  return (
    <HubPillButton
      variant={picked ? 'primary' : 'secondary'}
      aria-pressed={picked}
      className={cx('gap-1.5', space && 'pl-1.5', className)}
      {...buttonProps}
    >
      {space ? <SpaceThumb spaceId={space.id} image={space.image} /> : null}
      {label === null && space ? (
        <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
      ) : (
        <span className="max-w-[160px] truncate">{label ?? fallbackLabel}</span>
      )}
      <span
        className={cx(
          'tabular-nums transition-opacity',
          picked ? 'text-white/70' : 'text-grey-04',
          countsPending && 'opacity-50'
        )}
      >
        {formatFacetCount(count)}
      </span>
    </HubPillButton>
  );
}
