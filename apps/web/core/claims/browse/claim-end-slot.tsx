'use client';

import * as React from 'react';

import cx from 'classnames';
// A plain link, not `PrefetchLink`. That one warms the entity queries behind an entity page, which
// is worth it for a destination the reader is looking at — but the end slot rides on every card in
// a feed, and prefetching a debate for each of them is exactly the eager work the feed's viewport
// gating exists to avoid.
import Link from 'next/link';

import type { Debate } from '~/core/debates/api';
import { NavUtils } from '~/core/utils/utils';

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
 *   3. Watch the debate — one has been recorded.
 *   4. Nothing        — the row simply ends, which is the common case and must cost no layout.
 *
 * Request outranks live because it is the only one that needs the viewer: a live debate is still
 * there a second later, whereas a match evaporates when either party is taken.
 */
export function ClaimEndSlot({
  claimId,
  spaceId,
  activeDebate,
  pastDebate,
  enabled = true,
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
  /** The most recent recorded debate on this claim, for surfaces that have looked one up. */
  pastDebate?: { id: string; name: string | null } | null;
  /** False where the host cannot resolve the claim on the graph, so there is nothing to request. */
  enabled?: boolean;
  className?: string;
}) {
  const { match, blockedReason, isRequesting, requestError, request } = useClaimMatchup({
    claimId,
    spaceId,
    enabled,
  });

  // `smallButton` rather than `footnoteMedium`: this is a button, and the footnote scale is 11px at
  // weight 500 — small enough to squint at and heavy enough to look shouted, which is the worst
  // pairing for the one control the card most wants pressed.
  const base = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-smallButton transition-colors';

  if (match) {
    return (
      <span className={cx('flex shrink-0 flex-col items-end gap-1', className)}>
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
          {isRequesting ? 'Requesting…' : 'Request debate'}
        </button>
        {blockedReason || requestError ? (
          <span className="text-right text-footnote text-grey-04">{blockedReason ?? requestError}</span>
        ) : null}
      </span>
    );
  }

  if (activeDebate) {
    // The room where it is happening, or the feed when all we were told is that it is happening.
    const href =
      typeof activeDebate === 'object' ? `/space/${spaceId}/debates/${activeDebate.id}` : `/space/${spaceId}/debates`;

    return (
      <Link href={href} className={cx(base, 'border border-red-01 text-red-01 hover:bg-red-01/5', className)}>
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-red-01" aria-hidden />
        Watch live
      </Link>
    );
  }

  if (pastDebate) {
    return (
      <Link
        href={NavUtils.toEntity(spaceId, pastDebate.id)}
        className={cx(base, 'border border-grey-02 text-text hover:border-text', className)}
      >
        Watch the debate
      </Link>
    );
  }

  return null;
}
