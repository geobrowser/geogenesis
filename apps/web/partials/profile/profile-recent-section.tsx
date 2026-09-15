'use client';

import * as React from 'react';

import type { ExploreFeedItem, ExploreFeedRow } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';

import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

/** How many rows a preview shows before sending the reader to the tab. */
const SHOWN = 3;

/**
 * A few of this person's debates or claims, on the Overview tab (GEO-2859).
 *
 * A preview, not a second feed: Overview says who somebody is, and what they
 * have argued lately is part of that — but the whole list is a tab of its own,
 * one click away. Three rows is enough to show the kind of thing they argue
 * about without turning Overview into the record.
 *
 * The same `ExploreFeedCard` the tabs render, so a claim looks identical in
 * both places.
 */
export function ProfileRecentSection({
  title,
  rows,
  isLoading,
  href,
  seeAllLabel,
}: {
  title: string;
  rows: ExploreFeedRow[];
  isLoading: boolean;
  /** The tab holding the rest. */
  href: string;
  seeAllLabel: string;
}) {
  const shown = React.useMemo(() => rows.slice(0, SHOWN), [rows]);

  // Looked up once for the section. These are routinely spaces the viewer has
  // never opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(shown.map(row => row.spaceId))], [shown]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const items = React.useMemo(
    () => shown.map(row => toFeedItem(row, spaceLabel(labelsById, row.spaceId))),
    [labelsById, shown]
  );

  // Nothing at all rather than an empty heading. A section that says "Recent
  // debates" over a blank space reads as a page that failed to load, and most
  // accounts have never been in one.
  if (isLoading || rows.length === 0) return null;

  return (
    <section className="flex flex-col">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="flex items-center gap-2 text-metadataMedium text-grey-04">
          {title}
          <span className="rounded bg-grey-01 px-1.5 font-mono text-tag text-grey-04">{rows.length}</span>
        </h3>
        {rows.length > SHOWN && (
          <Link href={href} className="text-metadata text-ctaPrimary hover:underline">
            {seeAllLabel}
          </Link>
        )}
      </header>

      {/* The cards clear their own last rule, so they need to be one another's
          only siblings — see `PersonRecordFeed`. */}
      <div>
        {items.map(item => (
          <ExploreFeedCard key={`${item.entityId}-${item.spaceId}`} item={item} hideJoinButton titleOpensSidePanel />
        ))}
      </div>
    </section>
  );
}

/** A row plus its space's name and thumbnail. The Join button is hidden here. */
function toFeedItem(row: ExploreFeedRow, label: SpaceLabel | undefined): ExploreFeedItem {
  return {
    ...row,
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  };
}
