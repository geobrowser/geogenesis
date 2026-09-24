'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DebatePlaybackGate } from '~/core/debates/debate-playback-gate';
import { type ExploreFeedRow, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import { ACTIVITY_GALLERY_CARD_LIMIT } from '~/core/profile/activity-gallery';
import type { ClaimResponse } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';

import { PILL_BUTTON_CLASS_NAME, PILL_BUTTON_SECONDARY_CLASS_NAME, buttonClassNames } from '~/design-system/button';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';
import { NextButton, PreviousButton } from '~/design-system/table/table-pagination';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';
import { withSpaceTabsAnchor } from '~/partials/space-page/space-tabs-anchor';

import { GalleryClaimCard } from './gallery-claim-card';

const GALLERY_ACTIVATE_RATIO = 0.6;
const GALLERY_DEACTIVATE_RATIO = 0.4;

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
  /**
   * Link to {@link href} as given, without the tab-bar fragment.
   *
   * For a destination that has no tab bar to land on — the debates index is full-bleed, and
   * `SpaceChromeGate` strips the header and tabs from it — where the fragment is inert and only
   * shows up in a URL someone copies.
   */
  skipTabsAnchor?: boolean;
  seeAllLabel: string;
  /** Selects an in-place tab when the record is rendered inside a side panel. */
  onSeeAll?: () => void;
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
export function ProfileActivitySection({
  kinds,
  className,
}: {
  kinds: ActivityKind[];
  /**
   * Spacing owned by the surface rather than by the card.
   *
   * A profile stacks this in a `gap-6` column and needs none; a space's Overview puts it above an
   * authored page and needs a gap under it. Passed in rather than set here because the card decides
   * whether it renders at all — it returns `null` once both kinds settle empty — and a margin
   * applied by the caller would survive that disappearance as a band of blank space.
   */
  className?: string;
}) {
  // A failed kind is available: it has something to say, even if the something
  // is that it could not be read.
  const available = React.useMemo(() => kinds.filter(kind => kind.rows.length > 0 || kind.isError), [kinds]);
  // Whether the card is still assembling. Read twice: the skeleton below waits on
  // it, and so does the default — see `defaultKey`.
  const isLoading = kinds.some(kind => kind.isLoading);

  /**
   * The lead kind: the first that has a *settled* record to show.
   *
   * Settled, not merely non-empty, because the rows can arrive before their order
   * does. `usePersonDebates` hands the profile its debates a round trip before
   * `useEntityScores` says how to rank them, and the caller folds that second wait
   * into `isLoading` precisely so a row about to reshuffle is not put up as though
   * it were final. Preferring a settled kind here honours that.
   *
   * A preference, not a guarantee. Where nothing available has settled — one kind,
   * rows in, ranks still out — the fallback puts it up unsettled, because the
   * alternative is holding the card blank behind the slower request, which is the
   * one thing the skeleton gate below is written not to do. That case paints once
   * and reshuffles, exactly as it did before this change. Closing it means moving
   * when the card first paints, which is the gate's decision to make and not this
   * line's.
   */
  const lead = available.find(kind => !kind.isLoading) ?? available[0];

  /** The reader's own pick, and only that. Null until they make one. */
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);
  /**
   * The default, fixed at the moment the card first settles (GEO-3021).
   *
   * Two failure modes bracket this. Storing the default the first time *either*
   * kind had rows — what this used to do — let the network choose it: the kinds
   * are separate requests, so a profile whose claims came back first committed to
   * Claims and stayed there, because the debates landing did not invalidate a key
   * that still named an available kind. Deriving it on every render instead fixes
   * that end and breaks the other: a focus refetch turning up a first debate half
   * an hour later would pull a reader off the Claims they were reading, remount
   * the gallery under their cursor and start a video playing.
   *
   * So the default follows the record while the card is still assembling, and
   * stops the moment it has finished. After that, only the reader moves it.
   */
  const [defaultKey, setDefaultKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isLoading || defaultKey !== null || !lead) return;

    setDefaultKey(lead.key);
  }, [defaultKey, isLoading, lead]);

  /*
   * A pick whose kind has gone away is adopted onto what replaced it, rather than
   * dropped. Dropping it would hand the reader back to the default, which would
   * then pull them off this kind the moment their emptied one returned — a jump
   * under somebody who has not touched the toggle since. Falling back is already
   * a choice made on their behalf; this makes it the one that sticks.
   *
   * Not while there is nothing to adopt, though. Both kinds can blank at once —
   * the space Overview withholds every row while its counts are in flight — and
   * writing the fallback there would spend their pick on a gap in the data.
   */
  React.useEffect(() => {
    if (pickedKey === null || !lead || available.some(kind => kind.key === pickedKey)) return;

    setPickedKey(lead.key);
  }, [available, lead, pickedKey]);

  // Their pick, else the settled default, else the lead kind — Debates, on every
  // surface that renders this. All three held as keys rather than indexes, so a
  // kind arriving late cannot shift the selection out from under them.
  const selected =
    available.find(kind => kind.key === pickedKey) ?? available.find(kind => kind.key === defaultKey) ?? lead;

  const { sectionRef, reserveRef, prepareSwitch } = useMobileActivityHeightReserve(selected?.key);
  // The gallery measures whether its row can scroll; the arrows live in the header, so it reports
  // up. Null while no gallery is mounted — a kind that failed to load has no row to step through.
  const [navigation, setNavigation] = React.useState<GalleryNavigation | null>(null);

  // Reserve the section while its first usable record is on the way. Once either kind resolves,
  // draw it immediately rather than holding the whole card behind the slower request.
  if (available.length === 0 && isLoading) return <ProfileActivitySkeleton className={className} />;

  // Nothing at all once both kinds have settled empty. Most accounts have never been in a debate,
  // and a permanent heading over blank space would imply that content failed to render.
  if (available.length === 0 || !selected) return null;

  return (
    <div className={className}>
      <section
        ref={sectionRef}
        aria-label="Activity"
        data-activity-section
        className={cx(
          // Not a card. A bordered panel holding bordered cards spends two gutters and two rules on
          // saying "these belong together", which the pill row already says. No box and no rule: the
          // content sits flush with the column — on a phone the gallery can reach the screen edge.
          'flex flex-col'
        )}
      >
        {/*
         * The title is `sr-only`. The pills under it already name the two kinds, so on screen the
         * heading only repeated the row beneath it — but dropping it outright would take the
         * section out of the heading tree, and a reader navigating this page by heading would skip
         * straight past it to the comments.
         */}
        <h3 className="sr-only">Activity</h3>

        {/*
         * Debates and Claims as pills, with the row's own controls to their right. A kind with
         * nothing in it is left out, so a person with only debates sees one pill.
         */}
        <header className="flex flex-wrap items-center gap-2 pb-3">
          {available.map(kind => {
            const isSelected = kind.key === selected.key;

            return (
              <button
                key={kind.key}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  if (isSelected) return;

                  // Put the reserve in the document before React replaces
                  // the tall view. Waiting for the next layout effect would
                  // let the shorter DOM clamp `scrollY` while it is being
                  // measured, before the reserve could help.
                  prepareSwitch();
                  setPickedKey(kind.key);
                }}
                // The same pill as View all beside it — 28px, 16px type, the same padding — black
                // when selected (the Log in pill) and the secondary outline otherwise.
                className={
                  isSelected
                    ? buttonClassNames(PILL_BUTTON_CLASS_NAME)({ variant: 'primary' })
                    : buttonClassNames(PILL_BUTTON_SECONDARY_CLASS_NAME)({ variant: 'secondary' })
                }
              >
                {/* Up 1px: at the pill's 13px leading, Calibre's glyphs sit a pixel low in the box. */}
                <span className="relative -top-px">
                  {kind.label}
                  <span className={cx('ml-1.5 tabular-nums', isSelected ? 'text-white/70' : 'text-grey-03')}>
                    {kind.isCountUnavailable ? '—' : kind.total.toLocaleString()}
                  </span>
                </span>
              </button>
            );
          })}

          {/*
           * The row's own controls, right of the tabs: step through the cards, then leave for the
           * full tab. Both belong to the selected kind — see `navigation`.
           */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {selected.rows.length > 0 ? (
              // The data block galleries' own arrows (`table-pagination`), 12px apart as they are
              // there: dark when there is somewhere to go, grey at the row's end.
              <span className="mr-1 flex items-center gap-3">
                <PreviousButton isDisabled={!navigation?.left} onClick={() => navigation?.scrollByCard(-1)} />
                <NextButton isDisabled={!navigation?.right} onClick={() => navigation?.scrollByCard(1)} />
              </span>
            ) : null}
            <ActivitySeeAll kind={selected} />
          </div>
        </header>

        {selected.isError && selected.rows.length === 0 ? (
          /*
           * No retry here on purpose. This card is a summary; the tab its count
           * links to holds the authoritative list and offers the retry, so a
           * second control here would be a second thing to keep in step.
           */
          <p className="py-6 text-metadata text-grey-04">Couldn’t load {selected.label.toLowerCase()}.</p>
        ) : (
          <ActivityGallery
            // Each tab is a distinct playback collection. Remounting clears an explicit card
            // selection before any player in a revisited tab can resume from stale ownership.
            key={selected.key}
            rows={selected.rows}
            responseByClaimId={selected.responseByClaimId}
            personName={selected.personName}
            onNavigationChange={setNavigation}
          />
        )}
      </section>

      {/*
       * On narrow screens this supplies only the document height missing below
       * the current viewport. The reserve sits outside the section, so Claims
       * stays compact while switching away from the taller Debates view cannot
       * clamp the viewport upward. Profiles with content below Activity need no
       * reserve at all, and desktop keeps its natural layout.
       *
       * `hidden md:block`, not `md:hidden`: the breakpoints here are desktop-first
       * (`md` is `max-width: 767px`, see styles.css), so `md:hidden` hid this on
       * exactly the phones it exists for — `display: none` reserves no height, and
       * the fix was inert on the only screens that needed it.
       */}
      <div ref={reserveRef} data-activity-scroll-reserve aria-hidden className="pointer-events-none hidden md:block" />
    </div>
  );
}

function ProfileActivitySkeleton({ className }: { className?: string }) {
  return (
    <section aria-label="Loading activity" aria-busy="true" className={cx('flex flex-col', className)}>
      {/* Drawn here too, so the heading is in the tree before the rows are, not only after. */}
      <h3 className="sr-only">Activity</h3>
      <header className="flex items-center gap-2 pb-3">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </header>
      {/*
       * `py-2`, the gallery scroller's own padding — and no footer under it. The real section has
       * had neither a bottom rule nor a centered "see all" since that control moved up into the
       * header beside the arrows; the skeleton kept drawing both, so it stood ~85px taller than
       * what replaced it and everything below Activity jumped up when the rows landed.
       */}
      <div className="py-2">
        <Skeleton className="h-44 w-full rounded-lg" />
      </div>
    </section>
  );
}

function ActivitySeeAll({ kind }: { kind: ActivityKind }) {
  const className = buttonClassNames(PILL_BUTTON_SECONDARY_CLASS_NAME)({ variant: 'secondary' });

  if (kind.onSeeAll) {
    return (
      <button type="button" onClick={kind.onSeeAll} className={className}>
        {kind.seeAllLabel}
      </button>
    );
  }

  // A route navigation lands at the top of the page, which on a phone is a screenful of profile
  // chrome. The fragment puts the tab row under the navbar instead. Side panels use `onSeeAll`
  // above because their tabs are selected in place and have no route fragment to follow, and a
  // destination with no tab bar opts out — see `skipTabsAnchor`.
  return (
    <Link href={kind.skipTabsAnchor ? kind.href : withSpaceTabsAnchor(kind.href)} className={className}>
      {kind.seeAllLabel}
    </Link>
  );
}

/**
 * Keep the reader where they were while Activity views of different heights are swapped.
 *
 * Switching to a shorter view makes the document shorter, and a document that no longer reaches the
 * reader's viewport bottom has no scroll position to hold them at — the browser moves them up. On a
 * profile with content below Activity there is other height to absorb that; on a short one, like a
 * person with only an Activity card, there is none, and the page jumps to the top.
 *
 * Two things hold the position, in order of precedence:
 *
 *  1. A sibling reserve supplies exactly the document height missing below the viewport, so the
 *     shorter view never shortens the scrollable range. It is a sibling rather than a `min-height`
 *     on the section, which keeps a three-row Claims gallery from sitting inside a debate-sized box.
 *  2. If the position is lost anyway — the gallery can paint empty for a frame before its queries
 *     land, which shortens the document below even the reserve's reach — it is put back before the
 *     browser paints.
 */
function useMobileActivityHeightReserve(selectedKey: string | undefined) {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const reserveRef = React.useRef<HTMLDivElement | null>(null);
  const swapRef = React.useRef<{
    /** The layout this was calculated for. A different one invalidates it — see `sizeReserve`. */
    width: number;
    /** The position being held for the reader, which only ever moves up. */
    holdY: number;
  } | null>(null);
  const prepareSwitch = React.useCallback(() => {
    const section = sectionRef.current;
    const reserve = reserveRef.current;
    if (!section || !reserve) return;

    const { width, height } = section.getBoundingClientRect();
    swapRef.current = { width, holdY: window.scrollY };

    // Hold the outgoing view's whole height before React replaces it. Waiting for the layout effect
    // would leave a window where the document is short and the position is already gone; over-
    // reserving now costs nothing, because the effect below replaces it with the exact figure before
    // anything is painted.
    reserve.style.height = `${height}px`;
  }, []);

  React.useLayoutEffect(() => {
    const section = sectionRef.current;
    const reserve = reserveRef.current;
    if (!section || !reserve) return;

    // Sizing only. Nothing here moves the reader: this runs on every scroll, and a function that
    // both sizes the reserve and corrects the position will correct it every time they scroll —
    // which reads as the page refusing to move (GEO-2974).
    const sizeReserve = () => {
      const { width } = section.getBoundingClientRect();
      const swap = swapRef.current;

      // A new layout width (rotation, resized side panel, breakpoint change) has different card
      // wrapping. Drop the old calculation; the next tab switch will establish one for the new
      // layout.
      if (!swap || Math.abs(swap.width - width) > 1) {
        swapRef.current = null;
        reserve.style.height = '0px';
        return 0;
      }

      // Measured now rather than carried from the switch. The page keeps moving afterwards — the
      // cards grow as their queries land, a cover image arrives above, the rail settles — and a
      // figure taken once is wrong for every one of those. Subtracting what the reserve is
      // currently contributing is what makes this the height the page would have without it.
      const naturalDocumentHeight = document.documentElement.scrollHeight - reserve.getBoundingClientRect().height;
      const held = Math.max(0, swap.holdY + window.innerHeight - naturalDocumentHeight);
      reserve.style.height = `${held}px`;

      return held;
    };

    /**
     * Size, and let the swap go once the page no longer needs it.
     *
     * A swap that outlives its own settling is state waiting to be wrong: the cards grow, the
     * reserve reaches zero, and `holdY` sits there for as long as the reader stays on this tab —
     * so a shrink an hour later would conjure height back out of a position they left behind, and
     * leave them scrolling into blank space.
     *
     * Zero is the safe moment to let go precisely because nothing is being held at it, so dropping
     * the swap cannot move anybody. Not on the first sizing though — that one runs before the
     * correction below, and the correction needs the swap it belongs to.
     *
     * Only for changes that do not come back. Cards growing and the reader scrolling up both leave
     * the page needing less than it did, and go on needing less. A viewport is not like that: it
     * shrinks and grows again as the URL bar returns and hides, so settling on a shrink would
     * retire the swap during the half of that cycle where nothing is needed, and leave nothing to
     * rebuild the reserve on the half where it is. Resizes size, and do not settle.
     */
    const sizeAndSettle = () => {
      if (sizeReserve() === 0) swapRef.current = null;
    };

    sizeReserve();

    // The reserve is in the document now, so the position asked for is reachable again. If a frame
    // painted before it was — the gallery can paint empty while its queries land — the reader is put
    // back here, once, before the browser paints. Once, because this is a correction for the swap
    // that just happened and not a rule about where the page may be scrolled to.
    const swap = swapRef.current;
    if (swap && Math.abs(window.scrollY - swap.holdY) > 1) {
      window.scrollTo(0, swap.holdY);
    }

    if (typeof ResizeObserver === 'undefined') return;
    // Claim cards grow as their queries land. Shrink the reserve by the same amount so the overall
    // document height stays steady rather than drifting.
    const observer = new ResizeObserver(sizeAndSettle);
    observer.observe(section);

    // Armed a frame late, so the scroll events belonging to the swap itself — the correction above,
    // and any clamp it was correcting — are not read as the reader choosing to move.
    let armed = false;
    const arm = requestAnimationFrame(() => {
      armed = true;
    });

    const onScroll = () => {
      if (!armed) return;

      const current = swapRef.current;
      if (!current) return;

      // Once the reader moves up of their own accord, stop holding space they no longer need —
      // and back at the top there is nothing left to hold, so the swap goes with it. Moving down
      // needs nothing held and nothing released.
      if (window.scrollY < current.holdY) {
        current.holdY = window.scrollY;
        sizeAndSettle();
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    // `held` is measured against the viewport, and on a phone the viewport changes without anything
    // else on the page moving: iOS Safari grows `innerHeight` when its URL bar collapses under a
    // scroll and shrinks it back when the reader stops, firing `resize` both ways. A taller
    // viewport needs more held below it, and nothing here was watching — so the reader could be
    // clamped upward by exactly the height of a hidden URL bar. That is the device this was
    // reported from; Chrome on Android pins its layout viewport to the largest size instead, so
    // `innerHeight` never moves there and there is nothing to react to.
    //
    // `resize` rather than `visualViewport`, because `window.innerHeight` is the figure the sum
    // above uses and the two do not always agree. And it sizes without settling: see
    // `sizeAndSettle` for why a reversible change must not retire the swap.
    //
    // Sizing alone is not enough, because a growing viewport has already moved the reader by the
    // time this runs. While the reserve holds anything, it sizes the document so that `holdY` is
    // *exactly* the furthest the page can scroll — that is what holding the position means — so a
    // viewport 100px taller drops the maximum by 100 and the browser takes the reader with it,
    // every time rather than occasionally. Restoring afterwards is the same one-shot correction the
    // swap itself gets, for the same reason.
    const onViewportResize = () => {
      const swap = swapRef.current;
      if (!swap) {
        sizeReserve();
        return;
      }

      // Synchronously, inside the resize handler, and that ordering is the whole guard. The clamp
      // also arrives as a scroll event, which is dispatched after this runs — so by the time
      // `onScroll` reads the position it is the restored one, and there is nothing there for it to
      // mistake for the reader moving up.
      const target = swap.holdY;
      sizeReserve();

      if (Math.abs(window.scrollY - target) > 1) window.scrollTo(0, target);
    };
    window.addEventListener('resize', onViewportResize);

    return () => {
      cancelAnimationFrame(arm);
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onViewportResize);
    };
  }, [selectedKey]);

  return { sectionRef, reserveRef, prepareSwitch };
}

type GalleryNavigation = { left: boolean; right: boolean; scrollByCard: (direction: -1 | 1) => void };

function ActivityGallery({
  rows,
  responseByClaimId,
  personName,
  onNavigationChange,
}: {
  rows: ExploreFeedRow[];
  responseByClaimId?: Record<string, ClaimResponse>;
  personName?: string | null;
  /** Where the header's arrows learn whether this row can move, and how to move it. */
  onNavigationChange?: (navigation: GalleryNavigation | null) => void;
}) {
  const shown = React.useMemo(() => rows.slice(0, ACTIVITY_GALLERY_CARD_LIMIT), [rows]);

  // Looked up once for the gallery. These are routinely spaces the viewer has
  // never opened, which the browse sidebar cannot name.
  const rowSpaceIds = React.useMemo(() => [...new Set(shown.map(row => row.spaceId))], [shown]);
  const { labelsById } = useSpaceLabels(rowSpaceIds);

  const {
    scrollerRef,
    allowedDebateId,
    requestPlayback,
    setPlaybackAvailable,
    canScrollLeft,
    canScrollRight,
    scrollByCard,
  } = useActivityGallery(shown);

  React.useEffect(() => {
    onNavigationChange?.({ left: canScrollLeft, right: canScrollRight, scrollByCard });
  }, [canScrollLeft, canScrollRight, scrollByCard, onNavigationChange]);

  // Unmounted on a tab switch (it is keyed by kind) and when a kind fails: its row is gone, so the
  // header should not offer to scroll it.
  React.useEffect(() => () => onNavigationChange?.(null), [onNavigationChange]);

  return (
    // One at a time. Compact cards can leave several debates fully visible, so intersection alone
    // cannot choose. The first debate receives autoplay; clicking another player transfers the
    // gate before that click starts it, which also pauses the previous owner.
    <DebatePlaybackGate allowedId={allowedDebateId}>
      {/*
       * The wrapper, not the scroller, carries both of these.
       *
       * `@container`, because the container types imply `contain: inline-size`, and containing the
       * element whose overflow is the whole point is a bad trade for one class. The wrapper is also
       * the width the reader actually sees, which is what the cards want to measure — `cqw` below
       * reads this element, so widening only what scrolls would give the reader more to look at
       * without giving the cards any more to size against.
       *
       * The bleed takes it out through the app shell's own gutter on a phone, so a card can use the
       * full width and the one behind it is cut off by the screen edge rather than by a panel. `2ch`
       * is the shell's figure (`2xl:px-[2ch]` in `app/entry.tsx`) and the two have to stay equal, or
       * the gallery hangs off the side of the document and every profile scrolls sideways. `md` is
       * inside `2xl` in a desktop-first scale, so the gutter is always there to cancel.
       */}
      <div className="@container relative md:-mr-[2ch]">
        {/*
         * `snap-x` so a flick lands on a card rather than between two.
         *
         * No inset at the start: the first card sits flush with the column, under the pills. On a
         * phone the row bleeds to the screen edge, so a trailing spacer — not padding, which a
         * scroll container drops at its far end — keeps the last card off it.
         */}
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory items-start gap-4 overflow-x-auto py-2"
        >
          {shown.map(row => (
            <GalleryCard
              key={`${row.entityId}-${row.spaceId}`}
              row={row}
              label={spaceLabel(labelsById, row.spaceId)}
              response={responseByClaimId?.[normId(row.entityId)]}
              personName={personName}
              onDebatePlaybackRequest={requestPlayback}
              onDebatePlaybackAvailabilityChange={setPlaybackAvailable}
            />
          ))}
          <span aria-hidden className="w-0 shrink-0 md:pr-4" />
        </div>
      </div>
    </DebatePlaybackGate>
  );
}

/**
 * Own autoplay for a row where several debates can be visible at once.
 *
 * The first debate with a mounted player starts. A click on an active player transfers ownership
 * immediately; a click on an inactive visible edge centers that card and transfers once active.
 * Scrolling the rail or page keeps that owner until less than 40% of its two-dimensional area is
 * visible, then advances to a mounted card that is at least 60% visible. Those are the same
 * hysteresis edges and visibility dimensions used by the player itself, so the gate hands off at
 * the moment the outgoing player pauses rather than leaving a silent visible row. The same
 * measurement pass also drives the rail navigation controls.
 */
function useActivityGallery(rows: ExploreFeedRow[]) {
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const collectionKey = React.useMemo(() => rows.map(row => `${row.entityId}:${row.spaceId}`).join('|'), [rows]);
  const [availableDebateIds, setAvailableDebateIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const scheduleMeasureRef = React.useRef<(() => void) | null>(null);
  const availableRef = React.useRef(availableDebateIds);
  availableRef.current = availableDebateIds;
  // Ownership is state, not a derivation from row order. Once a player starts, a different row
  // finishing its lookup must not interrupt it; only click, visibility, or unavailability moves it.
  const [selectedPlaybackId, setSelectedPlaybackId] = React.useState<string | null>(null);
  const allowedDebateId =
    selectedPlaybackId &&
    availableDebateIds.has(normId(selectedPlaybackId)) &&
    rows.some(row => !isClaimRow(row) && ID.equals(row.entityId, selectedPlaybackId))
      ? selectedPlaybackId
      : null;
  const allowedRef = React.useRef(allowedDebateId);
  allowedRef.current = allowedDebateId;
  const [navigation, setNavigation] = React.useState({ left: false, right: false });

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    // A different Activity collection starts at its first card. Besides being the expected tab
    // behavior, this keeps the first debate selected for autoplay and actually visible together.
    scroller.scrollLeft = 0;
    let frame = 0;
    let previousScrollLeft = 0;

    const measure = () => {
      frame = 0;
      const scrollDirection = Math.sign(scroller.scrollLeft - previousScrollLeft);
      previousScrollLeft = scroller.scrollLeft;

      const scrollerBox = scroller.getBoundingClientRect();
      const cards = Array.from(scroller.querySelectorAll<HTMLElement>('[data-activity-card]'));
      const firstBox = cards.at(0)?.getBoundingClientRect();
      const lastBox = cards.at(-1)?.getBoundingClientRect();
      const nextNavigation = {
        // Card bounds, rather than raw scroll offsets, keep the controls tied to useful content.
        // The rail has spacer elements at both ends, and scrolling through those alone should not
        // leave an arrow visible after the first or last card is already fully in view.
        left: Boolean(firstBox && firstBox.left < scrollerBox.left - 1),
        right: Boolean(lastBox && lastBox.right > scrollerBox.right + 1),
      };
      setNavigation(current =>
        current.left === nextNavigation.left && current.right === nextNavigation.right ? current : nextNavigation
      );

      const visible = cards.flatMap((card, index) => {
        const id = card.dataset.activityDebateId;
        if (!id || !availableRef.current.has(normId(id))) return [];
        const box = card.getBoundingClientRect();
        const visibleWidth = Math.max(
          0,
          Math.min(box.right, scrollerBox.right, window.innerWidth) - Math.max(box.left, scrollerBox.left, 0)
        );
        const visibleHeight = Math.max(
          0,
          Math.min(box.bottom, scrollerBox.bottom, window.innerHeight) - Math.max(box.top, scrollerBox.top, 0)
        );
        return [
          {
            id,
            index,
            ratio: box.width > 0 && box.height > 0 ? (visibleWidth * visibleHeight) / (box.width * box.height) : 0,
          },
        ];
      });

      const currentId = allowedRef.current;
      const current = visible.find(card => currentId && ID.equals(card.id, currentId));
      if (current && current.ratio > GALLERY_DEACTIVATE_RATIO) return;

      const candidates = visible.filter(card => card.id && card.ratio >= GALLERY_ACTIVATE_RATIO);
      const directional =
        scrollDirection > 0
          ? candidates.find(card => current == null || card.index > current.index)
          : scrollDirection < 0
            ? [...candidates].reverse().find(card => current == null || card.index < current.index)
            : undefined;
      const next = directional ?? candidates.sort((a, b) => b.ratio - a.ratio)[0];

      if (next && (!currentId || !ID.equals(next.id, currentId))) {
        setSelectedPlaybackId(next.id);
      }
    };

    const scheduleMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scheduleMeasureRef.current = scheduleMeasure;

    measure();
    scroller.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(scroller);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (scheduleMeasureRef.current === scheduleMeasure) scheduleMeasureRef.current = null;
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [collectionKey]);

  // A player can appear or disappear without the rail moving (query completion, refetch failure,
  // or media eviction). Re-run the same visibility selection used by scrolling instead of falling
  // back to source order until some later scroll or resize happens to correct ownership.
  React.useEffect(() => {
    scheduleMeasureRef.current?.();
  }, [availableDebateIds]);

  const scrollByCard = React.useCallback(
    (direction: -1 | 1) => {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const firstCard = scroller.querySelector<HTMLElement>('[data-activity-card]');
      const cardWidth = firstCard?.getBoundingClientRect().width || 260;
      // `gap-4` is 16px. Move one complete card plus that gap so the next snap point lands flush.
      scroller.scrollBy({ left: direction * (cardWidth + 16), behavior: 'smooth' });
    },
    [scrollerRef]
  );

  const requestPlayback = React.useCallback((debateId: string) => {
    if (availableRef.current.has(normId(debateId))) setSelectedPlaybackId(debateId);
  }, []);

  const setPlaybackAvailable = React.useCallback((debateId: string, available: boolean) => {
    const id = normId(debateId);
    setSelectedPlaybackId(current => {
      if (available) return current ?? debateId;
      // An unavailable owner must not reclaim the gate merely by remounting later.
      return current && ID.equals(current, debateId) ? null : current;
    });
    setAvailableDebateIds(current => {
      if (current.has(id) === available) return current;

      const next = new Set(current);
      if (available) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  return {
    scrollerRef,
    allowedDebateId,
    requestPlayback,
    setPlaybackAvailable,
    canScrollLeft: navigation.left,
    canScrollRight: navigation.right,
    scrollByCard,
  };
}

/**
 * One card in the row.
 *
 * Debate cards stay at `260px`, leaving almost three in view at the profile's
 * 750px content width. Claim cards use `300px`: after the card's border and 24px
 * horizontal padding, their 274px pill row clears the 272px container-query threshold and
 * keeps both response buttons beside each other.
 *
 * Narrow enough that the next card is visibly cut off, which is what says the
 * row scrolls without a control saying so.
 */
function GalleryCard({
  row,
  label,
  response,
  personName,
  onDebatePlaybackRequest,
  onDebatePlaybackAvailabilityChange,
}: {
  row: ExploreFeedRow;
  label: SpaceLabel | undefined;
  response: ClaimResponse | undefined;
  personName?: string | null;
  onDebatePlaybackRequest: (debateId: string) => void;
  onDebatePlaybackAvailabilityChange: (debateId: string, available: boolean) => void;
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
      data-activity-debate-id={isClaim ? undefined : row.entityId}
      className={cx(
        // `cqw`, not `vw`. The viewport is the wrong ruler for a card in a side
        // panel: the panel is a column of its own width inside a window that may
        // be three times wider, so `84vw` there is not 84% of anything the reader
        // can see. The wrapper around the scroller establishes the container this
        // measures — see `ActivityGallery`.
        // 260 + 16px gaps shows 2.7 debate cards in the profile's content column. Claims need 300px
        // to preserve two response columns after the card's padding. `84cqw` remains the phone
        // ceiling, where the response row may stack rather than overflow.
        isClaim ? 'w-[min(300px,84cqw)]' : 'w-[min(260px,84cqw)]',
        'shrink-0 snap-start',
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
        <ExploreFeedCard
          item={toExploreFeedItem(row, label)}
          hideJoinButton
          titleOpensSidePanel
          compactDebateChrome
          onDebatePlaybackRequest={onDebatePlaybackRequest}
          onDebatePlaybackAvailabilityChange={onDebatePlaybackAvailabilityChange}
        />
      )}
    </div>
  );
}

/** Whether this row is a claim, by the same type check the feed's dispatcher uses. */
function isClaimRow(row: ExploreFeedRow) {
  return row.types.some(type => normId(type.id) === normId(CLAIM_TYPE_ID));
}
