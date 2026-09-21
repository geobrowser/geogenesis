'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DebatePlaybackGate } from '~/core/debates/debate-playback-gate';
import { type ExploreFeedRow, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import type { ClaimResponse } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';

import { PILL_BUTTON_CLASS_NAME, buttonClassNames } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';
import { withSpaceTabsAnchor } from '~/partials/space-page/space-tabs-anchor';

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
 * One section per kind, in the order given, each titled the way Experience
 * and Education are, with its own gallery and its own way to the full tab.
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
  // A failed kind is shown: it has something to say, even if the something is
  // that it could not be read. An empty one that loaded fine is left out.
  const available = React.useMemo(() => kinds.filter(kind => kind.rows.length > 0 || kind.isError), [kinds]);

  // Nothing at all rather than empty sections. A heading over a blank space reads
  // as a page that failed to load, and most accounts have never been in a debate.
  if (kinds.some(kind => kind.isLoading) || available.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      {available.map(kind => (
        <ActivityKindSection key={kind.key} kind={kind} />
      ))}
    </div>
  );
}

function ActivityKindSection({ kind }: { kind: ActivityKind }) {
  return (
    <section className="flex flex-col bg-white">
      <header className="flex items-center justify-between gap-2 pb-2">
        <h3 className="text-mediumTitle text-text">{kind.label}</h3>
        {/*
         * Lands on the tab bar, not the page top: the fragment puts the tab row
         * under the navbar, so the list opens at the top of the screen with the
         * underlined tab above it saying where the reader has been sent.
         */}
        <Link
          href={withSpaceTabsAnchor(kind.href)}
          // Both sections' buttons read "View all"; the label says which.
          aria-label={`${kind.seeAllLabel} ${kind.label.toLowerCase()}`}
          className={buttonClassNames(PILL_BUTTON_CLASS_NAME)({ variant: 'primary' })}
        >
          {kind.seeAllLabel}
        </Link>
      </header>

      {kind.isError && kind.rows.length === 0 ? (
        /*
         * No retry here on purpose. This section is a summary; the tab it links
         * to holds the authoritative list and offers the retry, so a second
         * control here would be a second thing to keep in step.
         */
        <p className="py-6 text-metadata text-grey-04">Couldn’t load {kind.label.toLowerCase()}.</p>
      ) : (
        <ActivityGallery rows={kind.rows} responseByClaimId={kind.responseByClaimId} personName={kind.personName} />
      )}
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
       * No inset at either end: the first and last cards sit flush with the
       * column's edges, in line with the heading above them.
       */}
      {/*
       * `@container` on a wrapper rather than on the scroller itself: the container types imply
       * `contain: inline-size`, and containing the element whose overflow is the whole point is a
       * bad trade for one class. The wrapper is the width the reader actually sees, which is what
       * the cards want to measure — see `GalleryCard`.
       *
       * The bleed takes it out through the app shell's own gutter on a phone, so the card behind
       * is cut off by the screen edge rather than by the column. `2ch` is the shell's figure
       * (`2xl:px-[2ch]` in `app/entry.tsx`) and the two have to stay equal, or the gallery hangs off
       * the side of the document and every profile scrolls sideways.
       */}
      <div className="@container md:-mr-[2ch]">
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory items-start gap-6 overflow-x-auto py-2"
        >
          {shown.map(row => (
            <GalleryCard
              key={`${row.entityId}-${row.spaceId}`}
              row={row}
              label={spaceLabel(labelsById, row.spaceId)}
              response={responseByClaimId?.[normId(row.entityId)]}
              personName={personName}
            />
          ))}
        </div>
      </div>
    </DebatePlaybackGate>
  );
}

/**
 * Which card is nearest the middle of the row.
 *
 * Measured rather than derived from the scroll offset over a card width: the
 * cards' width follows the row's (half of it, or 84% on a phone), so arithmetic
 * on a nominal width would drift. Read on scroll through a rAF, which is what
 * keeps a flick from measuring on every frame it fires.
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
        // be three times wider, so `84vw` there is not 84% of anything the reader
        // can see. The wrapper around the scroller establishes the container this
        // measures — see `ActivityGallery`.
        'shrink-0 snap-start',
        // Two cards side by side, both whole: half the row less half the 24px
        // gap. Below 640px half would be too narrow to read or watch, so a card
        // takes 84% of the row — enough for the 272px `claim-pills-wide` needs to
        // put Agree and Disagree side by side — and the next one peeks in.
        'w-[84cqw] @[640px]:w-[calc((100cqw-1.5rem)/2)]',
        // No outline around a debate. The feed's card also draws a rule under
        // itself to separate it from the next card *down* — which in a row is a
        // line under nothing — so that goes too.
        !isClaim && 'bg-white [&>*]:border-b-0 [&>*]:py-0'
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
