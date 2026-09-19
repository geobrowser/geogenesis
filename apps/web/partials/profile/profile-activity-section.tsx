'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DebatePlaybackGate } from '~/core/debates/debate-playback-gate';
import { type ExploreFeedRow, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import type { ClaimResponse } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';

import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';

import { GalleryClaimCard } from './gallery-claim-card';

/** How many cards a gallery holds before the reader is sent to the tab. */
const SHOWN = 6;

export type ActivityKind = {
  key: string;
  label: string;
  rows: ExploreFeedRow[];
  /** How this person answered, by claim id. Claims only; a debate has no response. */
  responseByClaimId?: Record<string, ClaimResponse>;
  /** Whose record this is, so the response tag can name them: "Susan agreed". */
  personName?: string | null;
  /**
   * How many there are in total.
   *
   * Not `rows.length`, which is one page: the claims gallery read 20 where the
   * rail beside it said 192. Both now come from the rail's own counts.
   */
  total: number;
  isLoading: boolean;
  /**
   * The count could not be read. Distinct from it being zero.
   *
   * The rows and the count are separate requests, so the card can hold real
   * debates beside a count that failed. It draws a dash there rather than a
   * confident 0 — the same thing the rail's `Fact` rows do, and for the same
   * reason: "0 debates" is a claim about a person.
   */
  isCountUnavailable?: boolean;
  /**
   * This kind's rows could not be read.
   *
   * Kept apart from "no rows", because the two look identical and mean opposite
   * things. A kind with neither rows nor an error is a person who has not done
   * that yet and is left out; a kind that *failed* stays, or the card quietly
   * drops half the record and the remaining toggle implies the other half is
   * empty.
   */
  isError?: boolean;
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
  // A failed kind is available: it has something to say, even if the something
  // is that it could not be read.
  const available = React.useMemo(() => kinds.filter(kind => kind.rows.length > 0 || kind.isError), [kinds]);
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
                    {kind.isCountUnavailable ? '—' : kind.total.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </header>

      {selected.isError && selected.rows.length === 0 ? (
        /*
         * No retry here on purpose. This card is a summary; the tab its count
         * links to holds the authoritative list and offers the retry, so a
         * second control here would be a second thing to keep in step.
         */
        <p className="px-4 py-6 text-metadata text-grey-04">Couldn’t load {selected.label.toLowerCase()}.</p>
      ) : (
        <ActivityGallery
          rows={selected.rows}
          responseByClaimId={selected.responseByClaimId}
          personName={selected.personName}
        />
      )}
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
  responseByClaimId,
  personName,
}: {
  rows: ExploreFeedRow[];
  responseByClaimId?: Record<string, ClaimResponse>;
  personName?: string | null;
}) {
  const shown = React.useMemo(() => rows.slice(0, SHOWN), [rows]);

  // Looked up once for the gallery. These are routinely spaces the viewer has
  // never opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(shown.map(row => row.spaceId))], [shown]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const { scrollerRef, centredId } = useCentredCard(shown);

  return (
    // One at a time. A debate card decides for itself whether to play from how
    // much of it is on screen, which is right in a stacked feed and wrong in a
    // row — here several are fully visible at once and every one of them would
    // start. The gate names the one nearest the middle.
    <DebatePlaybackGate allowedId={centredId}>
      {/*
       * `snap-x` so a flick lands on a card rather than between two.
       *
       * The gap at either end is a spacer element rather than padding on the
       * scroller: a scroll container's trailing padding is dropped by every
       * browser that matters, so `p-4` gave 16px on the left and nothing on the
       * right. Spacers are honoured on both sides, and `scroll-px` keeps a
       * snapped card off the edge it lands against.
       */}
      {/* `@container` on a wrapper rather than on the scroller itself: the
          container types imply `contain: inline-size`, and containing the
          element whose overflow is the whole point is a bad trade for one class.
          The wrapper is the width the reader actually sees, which is what the
          cards want to measure — see `GalleryCard`. */}
      <div className="@container">
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 items-start gap-4 overflow-x-auto py-2"
        >
          <span aria-hidden className="w-0 shrink-0 pl-4" />
          {shown.map(row => (
            <GalleryCard
              key={`${row.entityId}-${row.spaceId}`}
              row={row}
              label={spaceLabel(labelsById, row.spaceId)}
              response={responseByClaimId?.[normId(row.entityId)]}
              personName={personName}
            />
          ))}
          <span aria-hidden className="w-0 shrink-0 pr-4" />
        </div>
      </div>
    </DebatePlaybackGate>
  );
}

/**
 * Which card is nearest the middle of the row.
 *
 * Measured rather than derived from the scroll offset over a card width: the
 * cards are `min(420px, 80vw)` and the spacers at either end are not cards at
 * all, so arithmetic on a nominal width would drift. Read on scroll through a
 * rAF, which is what keeps a flick from measuring on every frame it fires.
 */
function useCentredCard(rows: ExploreFeedRow[]) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [centredIndex, setCentredIndex] = React.useState(0);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let frame = 0;

    const measure = () => {
      frame = 0;
      const cards = scroller.querySelectorAll('[data-activity-card]');
      if (cards.length === 0) return;

      // Both sides read from `getBoundingClientRect`, so both are in the
      // viewport's coordinates. `offsetLeft` against `scrollLeft` mixed two:
      // offsets are measured to the nearest *positioned* ancestor, which this
      // scroller is not, so every card's value carried a constant the scroll
      // position knew nothing about — the comparison came out the same however
      // far the row was scrolled, and the answer never moved off the first card.
      const scrollerBox = scroller.getBoundingClientRect();
      const middle = scrollerBox.left + scrollerBox.width / 2;

      let bestIndex = 0;
      let bestDistance = Infinity;

      cards.forEach((card, index) => {
        const box = card.getBoundingClientRect();
        const distance = Math.abs(box.left + box.width / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });

      setCentredIndex(bestIndex);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [rows]);

  return { scrollerRef, centredId: rows[centredIndex]?.entityId ?? null };
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
  response,
  personName,
}: {
  row: ExploreFeedRow;
  label: SpaceLabel | undefined;
  response: ClaimResponse | undefined;
  personName?: string | null;
}) {
  // A claim gets the debates panel's own card, and everything else the feed's.
  //
  // Not one card for both: the explore card is built to be read one to a row at
  // full width, and in a 420px column its padding and its separate tally block
  // read as a card with something wrong with it. The lobby card is already the
  // compact one, and a claim then looks the same wherever it is answered. A
  // debate keeps the feed's card, which is the one that plays.
  const isClaim = isClaimRow(row);

  return (
    <div
      data-activity-card
      className={cx(
        // `cqw`, not `vw`. The viewport is the wrong ruler for a card in a side
        // panel: the panel is a column of its own width inside a window that may
        // be three times wider, so `80vw` there is not 80% of anything the reader
        // can see. The scroller establishes the container this measures — see
        // `ActivityGallery`.
        'w-[min(420px,80cqw)] shrink-0 snap-start',
        // The lobby card brings its own outline; the feed's card does not, and
        // draws a rule underneath itself to separate it from the next card
        // *down* — which in a row is a line under nothing.
        !isClaim && 'rounded-lg border border-grey-02 bg-white px-3 [&>*]:border-b-0'
      )}
    >
      {isClaim ? (
        <GalleryClaimCard row={row} response={response} personName={personName} />
      ) : (
        // The Join button is hidden: this is a record being read, not a place to
        // be recruited into.
        <ExploreFeedCard item={toExploreFeedItem(row, label)} hideJoinButton titleOpensSidePanel />
      )}
    </div>
  );
}

/** Whether this row is a claim, by the same type check the feed's dispatcher uses. */
function isClaimRow(row: ExploreFeedRow) {
  return row.types.some(type => normId(type.id) === normId(CLAIM_TYPE_ID));
}
