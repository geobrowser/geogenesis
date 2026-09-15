'use client';

import * as React from 'react';

import cx from 'classnames';

import type { ExploreFeedItem, ExploreFeedRow } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import type { Stance } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';

import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

/** How many cards a gallery holds before the reader is sent to the tab. */
const SHOWN = 6;

export type ActivityKind = {
  key: string;
  label: string;
  rows: ExploreFeedRow[];
  /** Which side this person took, by claim id. Claims only; a debate has no stance. */
  stanceByClaimId?: Record<string, Stance>;
  /**
   * How many there are in total.
   *
   * Not `rows.length`, which is one page: the claims gallery read 20 where the
   * rail beside it said 192. Both now come from the rail's own counts.
   */
  total: number;
  isLoading: boolean;
  /** The tab holding the rest. */
  href: string;
  seeAllLabel: string;
};

/**
 * What this person has been doing lately, on Overview (GEO-2859).
 *
 * One card with a toggle rather than a section per kind. Debates and claims are
 * the same question asked twice — what have they argued about — and two stacked
 * galleries said they were different kinds of thing while burying the history
 * above them.
 *
 * The rows are the feed's own `ExploreFeedCard`, narrowed and laid sideways,
 * rather than a bespoke tile. That is what makes a debate here actually
 * playable and a claim here actually answerable: the card already holds the
 * player, the response buttons, the tally, and the Verify/Dispute vocabulary a
 * factual claim takes in place of Agree/Disagree. A tile reimplementing any of
 * that would be a second, worse copy of all of it — the bespoke one drew a
 * video inside an `<img>` and showed a grey box.
 */
export function ProfileActivitySection({ kinds }: { kinds: ActivityKind[] }) {
  const available = React.useMemo(() => kinds.filter(kind => kind.rows.length > 0), [kinds]);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  // Whichever the reader picked, or the first with anything in it. Held as a key
  // rather than an index so a kind arriving late — the two load separately —
  // cannot shift the selection out from under them.
  const selected = available.find(kind => kind.key === selectedKey) ?? available[0];

  // Nothing at all rather than an empty card. A heading over a blank space reads
  // as a page that failed to load, and most accounts have never been in a debate.
  if (kinds.some(kind => kind.isLoading) || available.length === 0 || !selected) return null;

  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white">
      {/* The toggles sit to the right of the heading, and wrap below it rather
          than squeezing into it on a narrow screen. */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-divider px-4 py-3">
        <h3 className="text-metadataMedium text-text">Activity</h3>

        {/* Only when there is a choice to make. One pill on its own is a label
            dressed up as a control. */}
        {available.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            {available.map(kind => {
              const isSelected = kind.key === selected.key;

              return (
                <button
                  key={kind.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedKey(kind.key)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-smallButton transition-colors',
                    isSelected
                      ? 'border-text bg-text text-white'
                      : 'border-grey-02 text-grey-04 hover:border-text hover:text-text'
                  )}
                >
                  {kind.label}
                  <span className={cx('tabular-nums', isSelected ? 'text-white/70' : 'text-grey-03')}>
                    {kind.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      <ActivityGallery rows={selected.rows} stanceByClaimId={selected.stanceByClaimId} />

      <Link
        href={selected.href}
        className="flex items-center justify-center gap-2 border-t border-divider py-3 text-metadataMedium text-grey-04 transition-colors hover:text-text"
      >
        {selected.seeAllLabel}
        <RightArrowLongSmall />
      </Link>
    </section>
  );
}

function ActivityGallery({
  rows,
  stanceByClaimId,
}: {
  rows: ExploreFeedRow[];
  stanceByClaimId?: Record<string, Stance>;
}) {
  const shown = React.useMemo(() => rows.slice(0, SHOWN), [rows]);

  // Looked up once for the gallery. These are routinely spaces the viewer has
  // never opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(shown.map(row => row.spaceId))], [shown]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  return (
    // `snap-x` so a flick lands on a card rather than between two.
    //
    // The gap at either end is a spacer element rather than padding on the
    // scroller: a scroll container's trailing padding is dropped by every
    // browser that matters, so `p-4` gave 16px on the left and nothing on the
    // right. Spacers are honoured on both sides, and `scroll-px` keeps a snapped
    // card off the edge it lands against.
    <div className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 items-stretch gap-4 overflow-x-auto py-2">
      <span aria-hidden className="w-0 shrink-0 pl-4" />
      {shown.map(row => (
        <GalleryCard
          key={`${row.entityId}-${row.spaceId}`}
          row={row}
          label={spaceLabel(labelsById, row.spaceId)}
          stance={stanceByClaimId?.[normId(row.entityId)]}
        />
      ))}
      <span aria-hidden className="w-0 shrink-0 pr-4" />
    </div>
  );
}

/**
 * One card in the row.
 *
 * `420px` on a wide screen, and never wider than the viewport allows on a
 * phone. Under `520px` the claim card switches to its own narrow arrangement —
 * `claim-card-narrow`, a container query — so this width is what puts it there,
 * and the card lays itself out rather than being told how.
 *
 * Narrow enough that the next card is visibly cut off, which is what says the
 * row scrolls without a control saying so.
 */
function GalleryCard({
  row,
  label,
  stance,
}: {
  row: ExploreFeedRow;
  label: SpaceLabel | undefined;
  stance: Stance | undefined;
}) {
  const item: ExploreFeedItem = {
    ...row,
    // The same last resort the feed uses for a space with no name.
    spaceName: label?.name ?? row.spaceId.slice(0, 8),
    spaceImage: label?.image ?? null,
    hasPendingMembershipRequest: false,
  };

  return (
    <div className="flex w-[min(420px,80vw)] shrink-0 snap-start flex-col rounded-lg border border-grey-02 px-4">
      {/*
       * Which side *this person* came down on — the thing you opened their
       * profile to find out, and not something the card itself can say, since
       * the card speaks for the viewer. Above it rather than inside it for the
       * same reason.
       */}
      {stance && (
        <div className="-mb-2 pt-3">
          <span
            className={cx(
              'inline-flex items-center rounded-full border px-2 py-px text-tag',
              stance === 'agree' ? 'border-green text-green' : 'border-red-01 text-red-01'
            )}
          >
            {stance === 'agree' ? 'Agreed' : 'Disagreed'}
          </span>
        </div>
      )}

      {/* The Join button is hidden: this is a record being read, not a place to
          be recruited into. Everything else the card draws — the player, the
          response buttons, the tally — is what this gallery is for. */}
      <ExploreFeedCard item={item} hideJoinButton titleOpensSidePanel />
    </div>
  );
}
