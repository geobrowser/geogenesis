'use client';

import * as React from 'react';

import cx from 'classnames';

import { spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { normId } from '~/core/utils/norm-id';

import { Avatar } from '~/design-system/avatar';
import { Skeleton } from '~/design-system/skeleton';

import { type DebateAnalyticsSurface, debateSurfaceAnalyticsAttributes } from './hub-analytics';
import { hubPillClassName } from './hub-pill-button';
import { formatFacetCount } from './topic-facets';

/**
 * Spaces drawn before the row folds the rest behind "N more". Enough for the handful of spaces that
 * hold debates today on one line; a row that keeps growing would push the week off the screen.
 */
export const SPACE_PILLS_BEFORE_MORE = 8;

/** Skeleton pills while the spaces are still on their way, so the row doesn't pop in under the search. */
const SKELETON_PILLS = 4;

type Props = {
  className?: string;
  analyticsSurface: DebateAnalyticsSurface;
  facetSpaces: { id: string; count: number }[];
  spaceIds: string[];
  onSpaceToggle: (spaceId: string) => void;
  onSpacesClear: () => void;
  /** The spaces themselves are still resolving: draw skeletons rather than nothing. */
  loading?: boolean;
  /** The counts in hand answer a filter that has since changed. */
  countsPending?: boolean;
};

/**
 * The space filter as a row of pills rather than a menu.
 *
 * The menu hid the spaces behind "Any space", and on the People tab few viewers ever opened it. A
 * row puts every space where it can be seen and picked in one press. Same OR semantics as the menu:
 * each pill toggles, "All spaces" clears.
 *
 * Ordered by count and *not* reordered on selection. The menu pins picked rows to the top, which is
 * right for a list you scroll; in a row of pills it would move the pill out from under the pointer
 * the moment it was pressed. Picking a space doesn't change any space's count (spaces are OR, so the
 * space facet is never narrowed by itself), so the order holds still while the viewer works the row.
 */
export function SpaceFilterPills({
  className,
  analyticsSurface,
  facetSpaces,
  spaceIds,
  onSpaceToggle,
  onSpacesClear,
  loading = false,
  countsPending = false,
}: Props) {
  const [expanded, setExpanded] = React.useState(false);

  const ordered = React.useMemo(
    () => [...facetSpaces].sort((a, b) => b.count - a.count || a.id.localeCompare(b.id)),
    [facetSpaces]
  );
  const ids = React.useMemo(() => ordered.map(space => space.id), [ordered]);
  const { labelsById, isLoading: labelsLoading } = useSpaceLabels(ids);

  const selected = React.useMemo(() => new Set(spaceIds.map(normId)), [spaceIds]);
  const isSelected = (spaceId: string) => selected.has(normId(spaceId));

  // A picked space past the fold stays on screen, or it would be filtering the week with no pill
  // left to say so or to untick it by.
  const shown = expanded
    ? ordered
    : ordered.filter((space, index) => index < SPACE_PILLS_BEFORE_MORE || isSelected(space.id));
  const hiddenCount = ordered.length - shown.length;

  if (ordered.length === 0) {
    if (!loading) return null;
    return (
      <div className={cx('flex flex-wrap items-center gap-2', className)} aria-hidden>
        {Array.from({ length: SKELETON_PILLS }, (_, index) => (
          <Skeleton key={index} className="h-7 w-24 rounded-full" />
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Filter by space"
      // Phones scroll the row sideways instead of stacking lines of pills above the day list.
      className={cx(
        'flex flex-wrap items-center gap-2 md:-mx-4 md:[scrollbar-width:none] md:flex-nowrap md:overflow-x-auto md:px-4 md:[&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      <button
        type="button"
        aria-pressed={spaceIds.length === 0}
        onClick={() => {
          if (spaceIds.length > 0) onSpacesClear();
        }}
        className={hubPillClassName(spaceIds.length === 0 ? 'primary' : 'secondary')}
        {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'All spaces pill', 'filter')}
      >
        All spaces
      </button>
      {shown.map(space => {
        const label = spaceLabel(labelsById, space.id);
        const pending = !label && labelsLoading;
        const on = isSelected(space.id);
        return (
          <button
            key={space.id}
            type="button"
            aria-pressed={on}
            // Picking a space nobody can name yet filters the week to something the viewer can't
            // read back off the row. The wait is short.
            disabled={pending}
            onClick={() => onSpaceToggle(space.id)}
            className={hubPillClassName(on ? 'primary' : 'secondary', 'gap-1.5 pl-1.5')}
            {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'Space pill', 'filter')}
          >
            <span className="block size-4 shrink-0 overflow-hidden rounded-sm bg-grey-02">
              <Avatar avatarUrl={label?.image ?? null} value={space.id} size={16} />
            </span>
            {pending ? (
              <Skeleton className="h-[1em] w-16" aria-label="Loading space name" />
            ) : (
              <span className="max-w-[160px] truncate">{label?.name ?? 'Space'}</span>
            )}
            <span
              className={cx(
                'tabular-nums transition-opacity',
                on ? 'text-white/70' : 'text-grey-04',
                countsPending && 'opacity-50'
              )}
            >
              {formatFacetCount(space.count)}
            </span>
          </button>
        );
      })}
      {hiddenCount > 0 || (expanded && ordered.length > SPACE_PILLS_BEFORE_MORE) ? (
        <button
          type="button"
          onClick={() => setExpanded(open => !open)}
          aria-expanded={expanded}
          className="h-7 shrink-0 px-1 text-metadata whitespace-nowrap text-grey-04 transition-colors hover:text-text"
          {...debateSurfaceAnalyticsAttributes(analyticsSurface, 'More spaces', 'filter')}
        >
          {expanded ? 'Fewer' : `${hiddenCount} more`}
        </button>
      ) : null}
    </div>
  );
}
