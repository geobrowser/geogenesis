'use client';

import * as React from 'react';

import { type SpaceLabel, spaceLabel } from '~/core/hooks/use-space-labels';

import { ThumbGeoImage } from '~/design-system/geo-image';

/**
 * How many space icons a row draws before the rest become a count.
 *
 * Three, because the row they sit on is already a grid of avatar, name and a button inside a panel
 * narrow enough that GEO-2774 exists about it. The icons are an at-a-glance "where is this person"
 * rather than a list — anyone wanting the list has their profile a click away — so the cap is set
 * by what the row can spare, not by what a person might plausibly join.
 */
export const PERSON_SPACE_ICON_CAP = 3;

/**
 * The spaces a person is in, as icons, capped with an overflow count.
 *
 * Shares `HubFilterMenu`'s option-row treatment — same 5px-radius thumb, same lettered fallback for
 * a space with no image — so a space recognised in the filter menu is recognisable here.
 *
 * Renders nothing at all when the person is in no spaces, rather than an empty slot: the row is a
 * grid, and an always-present element would indent every name by the width of icons half the list
 * does not have.
 */
export function PersonSpaceIcons({
  spaceIds,
  labelsById,
}: {
  spaceIds: string[];
  labelsById: Map<string, SpaceLabel>;
}) {
  if (spaceIds.length === 0) return null;

  const shown = spaceIds.slice(0, PERSON_SPACE_ICON_CAP);
  const overflow = spaceIds.length - shown.length;

  return (
    // `title` on each icon rather than visible names: the names are what the filter menu is for,
    // and three of them would not fit beside a button in this panel.
    <span className="flex min-w-0 items-center gap-1">
      {shown.map(spaceId => {
        const label = spaceLabel(labelsById, spaceId);
        const name = label?.name?.trim() || 'Space';

        return label?.image ? (
          <span
            key={spaceId}
            title={name}
            className="relative h-4 w-4 shrink-0 overflow-hidden rounded-[5px]"
            data-testid="person-space-icon"
          >
            <ThumbGeoImage value={label.image} alt="" />
          </span>
        ) : (
          <span
            key={spaceId}
            title={name}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-grey-01 text-[9px] font-medium text-grey-04"
            data-testid="person-space-icon"
          >
            {(name.slice(0, 1).toUpperCase() || '?').replace(/[^A-Z0-9?]/g, '?')}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          className="shrink-0 text-[10px] leading-none text-grey-04 tabular-nums"
          data-testid="person-space-overflow"
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
