'use client';

import * as React from 'react';

import cx from 'classnames';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

/**
 * A collapsed "Show … (N)" disclosure under a ranking screen list: pressed, it opens its rows and reads
 * "Hide … (N)". Pending (awaiting-approval) entries are hidden from the global list by default and
 * opted into here; To rank shows the ranked debates matching a search or filter the same way
 * (GEO-3810). Nothing renders at a count of 0.
 */
export function RankingComposePendingDisclosure({
  count,
  label = 'pending',
  analyticsLabels,
  children,
}: {
  count: number;
  /** What the rows are, after Show / Hide: "pending", "ranked debates". */
  label?: string;
  /** `data-geo-analytics-label` for the button while closed (show) and open (hide). */
  analyticsLabels?: { show: string; hide: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  if (count === 0) return null;

  return (
    <div className="border-t border-grey-02">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        data-geo-analytics-label={analyticsLabels ? (open ? analyticsLabels.hide : analyticsLabels.show) : undefined}
        className="flex w-full items-center justify-between py-3 text-metadata text-grey-04 transition hover:text-text"
      >
        <span>
          {open ? 'Hide' : 'Show'} {label} ({count})
        </span>
        <span className={cx('flex transition-transform', open && 'rotate-180')}>
          <ChevronDownSmall color="grey-04" />
        </span>
      </button>
      {open ? children : null}
    </div>
  );
}
