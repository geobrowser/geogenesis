'use client';

import * as React from 'react';

import cx from 'classnames';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DebatePlaybackGate } from '~/core/debates/debate-playback-gate';
import { type ExploreFeedRow, toExploreFeedItem } from '~/core/explore/explore-card-item';
import { type SpaceLabel, spaceLabel, useSpaceLabels } from '~/core/hooks/use-space-labels';
import { ID } from '~/core/id';
import type { ClaimResponse } from '~/core/profile/use-person-positions';
import { normId } from '~/core/utils/norm-id';

import { ChevronRight } from '~/design-system/icons/chevron-right';
import { RightArrowLongSmall } from '~/design-system/icons/right-arrow-long-small';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';

import { ExploreFeedCard } from '~/partials/explore/explore-feed-card';
import { withSpaceTabsAnchor } from '~/partials/space-page/space-tabs-anchor';

import { GalleryClaimCard } from './gallery-claim-card';

/** How many cards a gallery holds before the reader is sent to the tab. */
const SHOWN = 6;
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

  const { sectionRef, reserveRef, prepareSwitch } = useMobileActivityHeightReserve(selected?.key);

  // Nothing at all rather than an empty card. A heading over a blank space reads
  // as a page that failed to load, and most accounts have never been in a debate.
  if (kinds.some(kind => kind.isLoading) || available.length === 0 || !selected) return null;

  return (
    <div>
      <section
        ref={sectionRef}
        data-activity-section
        className={cx(
          'flex flex-col overflow-hidden rounded-lg border border-grey-02 bg-white',
          // Not a card on a phone. A bordered panel holding bordered cards spends two gutters and two
          // rules on saying "these belong together", which the heading already says — and on a 390px
          // screen that is most of what a claim's buttons needed. The heading and the rule under it
          // stay; the box around them goes, and the gallery below can reach the screen edge.
          'md:overflow-visible md:rounded-none md:border-0 md:bg-transparent'
        )}
      >
        {/* The toggles sit to the right of the heading, and wrap below it rather
          than squeezing into it on a narrow screen. */}
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-divider px-4 py-3 md:px-0">
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
                    onClick={() => {
                      if (isSelected) return;

                      // Put the reserve in the document before React replaces
                      // the tall view. Waiting for the next layout effect would
                      // let the shorter DOM clamp `scrollY` while it is being
                      // measured, before the reserve could help.
                      prepareSwitch();
                      setSelectedKey(kind.key);
                    }}
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
            // Each tab is a distinct playback collection. Remounting clears an explicit card
            // selection before any player in a revisited tab can resume from stale ownership.
            key={selected.key}
            rows={selected.rows}
            responseByClaimId={selected.responseByClaimId}
            personName={selected.personName}
          />
        )}
        {/*
         * Lands on the tab bar, not the page top.
         *
         * A navigation lands at the top of the page, which on a phone is a screenful of cover,
         * avatar, name, roles and bio — none of it what "See all debates" was clicked for. The
         * fragment puts the tab row under the navbar instead, so the list opens at the top of the
         * screen with the underlined tab above it saying where the reader has been sent.
         */}
        <Link
          href={withSpaceTabsAnchor(selected.href)}
          className="flex items-center justify-center gap-2 border-t border-divider py-3 text-metadataMedium text-grey-04 transition-colors hover:text-text"
        >
          {selected.seeAllLabel}
          <RightArrowLongSmall />
        </Link>
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

  const {
    scrollerRef,
    allowedDebateId,
    requestPlayback,
    setPlaybackAvailable,
    canScrollLeft,
    canScrollRight,
    scrollByCard,
  } = useActivityGallery(shown);

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
         * The gap at either end is a spacer element rather than padding on the scroller: a scroll
         * container's trailing padding is dropped by every browser that matters, so `p-4` gave 16px
         * on the left and nothing on the right. Spacers are honoured on both sides, and `scroll-px`
         * keeps a snapped card off the edge it lands against.
         */}
        <div
          ref={scrollerRef}
          className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 items-start gap-4 overflow-x-auto py-2 md:scroll-px-0"
        >
          <span aria-hidden className="w-0 shrink-0 pl-4 md:pl-0" />
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
          <span aria-hidden className="w-0 shrink-0 pr-4" />
        </div>

        {canScrollLeft ? <GalleryNavigationButton direction="left" onClick={() => scrollByCard(-1)} /> : null}
        {canScrollRight ? <GalleryNavigationButton direction="right" onClick={() => scrollByCard(1)} /> : null}
      </div>
    </DebatePlaybackGate>
  );
}

/**
 * Own autoplay for a row where several debates can be visible at once.
 *
 * The first debate with a mounted player starts. A click transfers ownership immediately.
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
  const availableRef = React.useRef(availableDebateIds);
  availableRef.current = availableDebateIds;
  const firstDebateId =
    rows.find(row => !isClaimRow(row) && availableDebateIds.has(normId(row.entityId)))?.entityId ?? null;
  const [requestedPlayback, setRequestedPlayback] = React.useState<{ collectionKey: string; debateId: string } | null>(
    null
  );
  const requestedDebateId = requestedPlayback?.collectionKey === collectionKey ? requestedPlayback.debateId : null;
  const allowedDebateId =
    requestedDebateId &&
    availableDebateIds.has(normId(requestedDebateId)) &&
    rows.some(row => !isClaimRow(row) && ID.equals(row.entityId, requestedDebateId))
      ? requestedDebateId
      : firstDebateId;
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
        setRequestedPlayback({ collectionKey, debateId: next.id });
      }
    };

    const scheduleMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('scroll', scheduleMeasure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(scroller);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [collectionKey]);

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

  const requestPlayback = React.useCallback(
    (debateId: string) => {
      if (availableRef.current.has(normId(debateId))) setRequestedPlayback({ collectionKey, debateId });
    },
    [collectionKey]
  );

  const setPlaybackAvailable = React.useCallback((debateId: string, available: boolean) => {
    const id = normId(debateId);
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

function GalleryNavigationButton({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Scroll activity ${direction}`}
      onClick={onClick}
      className={cx(
        'absolute top-1/2 z-30 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-grey-02 bg-white text-text shadow-card transition-colors hover:bg-grey-01 focus-visible:border-text focus-visible:outline-none',
        direction === 'left' ? 'left-2' : 'right-2'
      )}
    >
      <span className={direction === 'left' ? 'rotate-180' : undefined} aria-hidden>
        <ChevronRight />
      </span>
    </button>
  );
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
