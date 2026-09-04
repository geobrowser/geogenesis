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

import { RequestDebateControl } from '~/core/debates/request-debate-control';
import { type DebateRequestPosition, debateRequestGate } from '~/core/debates/request-gate';
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
  position,
  className,
}: {
  claimId: string;
  spaceId: string;
  /**
   * The viewer's position on this claim, from both clocks, so the offer only appears once geo-chat
   * will honour it (GEO-2808).
   *
   * geo-chat validates a request against its *own* copy of the position and rejects an early one
   * with `claim_response_required`. Every host of this slot already runs `useClaimPositionControl`,
   * which holds both readings — so this is required rather than optional: a host that could not
   * answer would be offering a debate it has no way to know is valid, which is what the hub and the
   * feed cards were doing.
   */
  position: DebateRequestPosition;
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

  // `match` is this surface's opponent half — somebody standing ready on the other side. The
  // position half is the shared rule, so every surface waits on the same fact and names it the
  // same way.
  const gate = debateRequestGate({
    chatPosition: position.chat,
    localPosition: position.local,
    opponentReady: match !== null,
    indexingDelayed: position.indexingDelayed,
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

  // A match is derived from the same `debate_claim_readiness` rows `create_debate_request_as` reads,
  // so no additional position check belongs here — one against the graph would only be slower.
  //
  // Not a guarantee the request will be accepted: the match query omits that endpoint's
  // `validation_failed_at IS NULL` / `last_validated_at IS NOT NULL` predicates and its
  // attempted-recipient exclusion, so a failed validation sweep or an already-tried opponent still
  // draws a live button. Which is why the refusal below is rendered rather than swallowed.
  if (match) {
    return (
      <RequestDebateControl
        onRequest={request}
        disabled={Boolean(blockedReason) || !gate.canRequest}
        isRequesting={isRequesting}
        pending={gate.pending}
        pendingLabel={gate.pendingLabel}
        blockedReason={blockedReason}
        requestError={requestError}
        variant={variant}
        className={className}
      />
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
