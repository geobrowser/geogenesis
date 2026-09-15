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

import { RequestDebateControl, claimSlotPillClass } from '~/core/debates/request-debate-control';
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
  viewerPosition,
  className,
}: {
  claimId: string;
  spaceId: string;
  /**
   * The side the viewer holds: a boolean, `null` for "holds none", `undefined` for "not known yet".
   *
   * Three values rather than two, because collapsing the last two is what makes this check either
   * useless or harmful. Withdrawing on "holds none" is the point — clearing your position has to
   * take the offer resting on it away. Withdrawing on "not known yet" hides an offer the server
   * would accept, on a card whose reads have simply not landed, which is the direction #2376
   * reverted a different check for.
   *
   * Not the position check #2354 added and #2376 took back out. That one compared the local side
   * against geo-chat's copy and waited for them to agree, which is a wait this endpoint never needed
   * — see the note above the match check. This never waits on geo-chat at all: it reads the side the
   * *match* was already computed for, which is in hand, and asks whether it contradicts the side the
   * reader is on. Silence is not a contradiction.
   */
  viewerPosition: boolean | null | undefined;
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

  // The live-debate link below shares its shape with this offer, so both read the size from one
  // place — see `claimSlotPillClass` for the metrics and for why it is not the debates pill.
  const base = claimSlotPillClass(variant);

  // Whether the match is still about the side the viewer is on.
  //
  // Not a second position check — it never asks geo-chat anything. `/matchmaking/matches` is one
  // account-level query, fetched once with `refetchOnWindowFocus` off, so its rows keep describing
  // the side the viewer held when it was fetched. Switch sides and the "opponent" it names is now
  // standing on the *same* side; press the offer and geo-chat refuses, correctly, as nobody holding
  // the opposite position being available — an error the reader has no way to connect to the side
  // they just changed. The match carries the side it was computed for, so this is answerable from
  // what is already in hand.
  //
  // `viewer_response` is the richer field and `viewer_position` the one a match always carries.
  //
  // Hiding rather than disabling: a greyed button still says a debate is on offer here. On a side
  // the reader has stepped off, there is none to make.
  //
  // Only a positive contradiction withdraws it. Both readings have to be known and they have to
  // disagree — an unknown local side, or a match that names none, leaves the offer alone.
  const matchedSide = match ? (match.viewer_response?.position ?? match.viewer_position) : null;
  const contradictsViewerSide =
    matchedSide !== null && matchedSide !== undefined && viewerPosition !== undefined && matchedSide !== viewerPosition;

  // A match is otherwise derived from the same `debate_claim_readiness` rows
  // `create_debate_request_as` reads, so nothing further about the position belongs here — a check
  // against the graph would only be slower, which is why #2376 took one back out.
  //
  // Not a guarantee the request will be accepted: the match query omits that endpoint's
  // `validation_failed_at IS NULL` / `last_validated_at IS NOT NULL` predicates and its
  // attempted-recipient exclusion, so a failed validation sweep or an already-tried opponent still
  // draws a live button. Which is why the refusal below is rendered rather than swallowed.
  if (match && !contradictsViewerSide) {
    return (
      <RequestDebateControl
        onRequest={request}
        disabled={Boolean(blockedReason)}
        isRequesting={isRequesting}
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
