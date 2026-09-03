'use client';

import * as React from 'react';

import cx from 'classnames';
// A plain link, not `PrefetchLink`. That one warms the entity queries behind an entity page, which
// is worth it for a destination the reader is looking at — but the end slot rides on every card in
// a feed, and prefetching a debate for each of them is exactly the eager work the feed's viewport
// gating exists to avoid.
import Link from 'next/link';

import type { Debate } from '~/core/debates/api';
import { debatePath } from '~/core/debates/debate-routes';

import { useClaimMatchup } from './use-claim-matchup';

/**
 * The end of a claim's meta row: whatever this claim offers the reader right now.
 *
 * One slot, and every state in it is a verb. That is the point of the thing. `active_debate` is the
 * most compelling fact the system holds about a claim, and rendered as a status — "Debating now" —
 * it earned the most prominent corner of the card and then gave the reader nowhere to go. A slot
 * that always answers "what can I do about this" is worth learning the position of; a slot that
 * sometimes reports weather is not.
 *
 * Priority, most actionable first:
 *
 *   1. Request debate — someone is standing ready on the side opposite the viewer's.
 *   2. Watch live     — a debate is running on this claim.
 *   3. Nothing        — the row simply ends, which is the common case and must cost no layout.
 *
 * A fourth state, "Watch the debate" for a recorded one, was specified and built and then had no
 * caller: no surface looks a past debate up, and the poster still it wanted needs a keyframe query
 * per card. It is not here rather than here-but-unreachable, because a branch nothing can enter is
 * read later as a state the product has.
 *
 * Request outranks live because it is the only one that needs the viewer: a live debate is still
 * there a second later, whereas a match evaporates when either party is taken.
 */
export function ClaimEndSlot({
  claimId,
  spaceId,
  activeDebate,
  enabled = true,
  variant = 'inline',
  className,
}: {
  claimId: string;
  spaceId: string;
  /**
   * The live debate on this claim.
   *
   * Two shapes because geo-chat reports two: a `DebateClaim` row carries the debate itself, while
   * the hub's paged index carries only a flag. Given the debate we can open the room; given the
   * flag we can only say a debate is on and point at the feed, which is still better than saying
   * nothing about the most compelling state a claim has.
   */
  activeDebate?: Debate | boolean | null;
  /**
   * False while the host is not ready to ask — a feed card still below the fold.
   *
   * Not "the graph cannot resolve this claim". That is what it used to mean, and it was wrong:
   * nothing in this slot touches the graph. Both the match and the live debate are geo-chat's, and
   * the request is a geo-chat mutation against the ids geo-chat handed us, so a match the server has
   * already made is one it will honour whatever the graph makes of the id. `UnresolvableControls`
   * leaves the slot on for exactly that reason — gating it there took the request control off every
   * card on the Matches tab, which is a tab where every card is a match by definition.
   *
   * It is a real gate all the same: `useClaimMatchup` masks a disabled lookup to null rather than
   * serving another host's cached match, so this must only ever mean "not yet", never "not allowed".
   */
  enabled?: boolean;
  /**
   * How the slot sits in its host.
   *
   * `inline` ends a meta row, where the offer is one item among several and has to be the height of
   * its neighbours. `block` stands under the position pills on the claim page, where it is the next
   * thing you do after taking a side — so it takes their full width and their height, and reads as
   * the continuation of that row rather than a control that wandered in.
   */
  variant?: 'inline' | 'block';
  className?: string;
}) {
  const { match, blockedReason, isRequesting, requestError, request } = useClaimMatchup({
    claimId,
    spaceId,
    enabled,
  });

  // Sized to the row it sits in rather than to itself.
  //
  // It was the explore page's "Rank" CTA — 16px in a 28px pill — which is right for a standalone
  // call to action in a panel and wrong here: the meta row is 14px text about 20px tall, so a 28px
  // control grew the row by 8px the moment the match lookup answered. That is the layout shift, and
  // no amount of reserving height fixes it without holding every claim card 8px taller than its
  // neighbours to no purpose.
  //
  // So it follows the Join button instead, which is the control already living in this row: 14px at
  // `leading-none` in a 20px pill. Same height as its neighbour, so the row cannot grow.
  const base = cx(
    'items-center gap-1.5 rounded-full transition-colors',
    variant === 'block'
      ? // The position pills' own metrics: `min-h-7` and `text-button`, full width beneath them.
        'flex min-h-7 w-full justify-center px-3 text-button'
      : 'inline-flex h-5 shrink-0 px-2.5 text-[14px] leading-none'
  );

  // A match is derived from the same readiness rows validated by `create_debate_request_as`, so no
  // additional position check is required on this surface.
  if (match) {
    return (
      <span className={cx('flex flex-col gap-1', variant === 'block' ? 'w-full' : 'shrink-0 items-end', className)}>
        <button
          type="button"
          onClick={request}
          disabled={Boolean(blockedReason) || isRequesting}
          // Shown rather than left to a `title`: native tooltips never appear on touch and are
          // unreliable on a disabled button, which is exactly when the explanation matters.
          title={blockedReason}
          className={cx(
            base,
            // Filled dark, not red. In this product red is Dispute — it fills the negative pill an
            // inch below this and the negative half of the bar beneath that — so a red button here
            // reads as a side rather than an action. Dark is the only weight left that means
            // "primary" without borrowing a meaning that is already taken.
            'bg-text text-white hover:bg-text/90 disabled:cursor-default disabled:opacity-50'
          )}
        >
          {/* Both labels stacked in one grid cell, so the button is always as wide as the longer of
              them. "Requesting…" is the shorter, and a button that shrinks the moment you press it
              reads as something having gone wrong. The grid is on this span rather than the button
              so it cannot fight the button's own `inline-flex`. */}
          <span className="grid place-items-center">
            <span className="invisible col-start-1 row-start-1" aria-hidden>
              Request debate
            </span>
            <span className="col-start-1 row-start-1">{isRequesting ? 'Requesting…' : 'Request debate'}</span>
          </span>
        </button>
        {/* A blocked reason is a standing condition the reader can see for themselves, so it is
            ordinary text. A failed request is an event that happens after they press, with nothing
            on screen to mark it — `role="alert"` is what makes it reach anyone not watching this
            corner. The Matches tab's old button announced it; losing that when the button moved
            would have been a silent regression. */}
        {blockedReason ? (
          <span className={cx('text-footnote text-grey-04', variant === 'block' ? 'text-left' : 'text-right')}>
            {blockedReason}
          </span>
        ) : null}
        {requestError ? (
          <span
            role="alert"
            className={cx('text-footnote text-red-01', variant === 'block' ? 'text-left' : 'text-right')}
          >
            {requestError}
          </span>
        ) : null}
      </span>
    );
  }

  if (activeDebate) {
    // The room where it is happening, or the feed when all we were told is that it is happening.
    //
    // `debatePath` rather than this host's own `spaceId`: a debate room lives under the space its
    // *claim* came from, and the two agree only for as long as every surface renders rows it
    // fetched under the space it is showing. The panel already fetches its rows per claim space.
    const href = typeof activeDebate === 'object' ? debatePath(activeDebate) : `/space/${spaceId}/debates`;

    return (
      <Link href={href} className={cx(base, 'border border-red-01 text-red-01 hover:bg-red-01/5', className)}>
        <span className="size-1 shrink-0 animate-pulse rounded-full bg-red-01" aria-hidden />
        Watch live
      </Link>
    );
  }

  // An empty box of exactly the slot's height, rather than nothing.
  //
  // This is the layout shift, and it is the slot's to fix rather than the row's. The offer arrives
  // when an account-level match lookup answers — after first paint, always — and a 20px control
  // appearing in a row whose other content is 13px tall pushes everything below it down. Holding
  // the height here costs nothing horizontally (the slot is `ml-auto` against a left-aligned row)
  // and keeps the reservation with the thing being reserved for, instead of scattering a `min-h`
  // across every row that happens to host one.
  //
  // The row settles at 20px either way, which is the height it already has whenever the Join pill is
  // present — so this matches its neighbours in the common case and runs a few pixels taller than a
  // generic card that has no Join pill.
  // Nothing to reserve where the slot is a block: it sits under the pills rather than inside a row
  // whose height it would otherwise change.
  if (variant === 'block') return null;

  return <span className={cx('h-5 shrink-0', className)} aria-hidden />;
}
