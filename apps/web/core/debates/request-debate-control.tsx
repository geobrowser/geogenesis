'use client';

import cx from 'classnames';

import * as React from 'react';

/**
 * The offer to debate a claim, as one control (GEO-2825).
 *
 * The debates side panel and the "debate again" picker both make this offer, and they used to draw
 * it differently — the panel a dark pill ending the card's meta row, the picker a full-width
 * `HubPillButton` in a footer. Same words, same action, two designs and two copies of the state
 * ladder underneath. Moving between the surfaces read as moving between two products.
 *
 * The *action* stays with the caller, because it genuinely differs: the panel sends
 * `create_debate_request_as`, the picker a session-scoped rematch request. Only the offer is shared
 * — what it looks like, what it is called in each state, and how it announces itself.
 */
/**
 * The shape of a control in a claim card's end slot.
 *
 * Exported because the slot holds two of them — this offer and the live-debate link beside it in
 * `claim-end-slot` — and they have to be the same size. Sized to the row rather than to itself: the
 * meta row is 14px text about 20px tall, so a 28px control grew the row by 8px the moment the match
 * lookup answered. It follows the Join button instead, the control already living in that row.
 *
 * Deliberately not `HubPillButton`, whose whole purpose is collapsing hand-written pills — its
 * `h-7` is precisely the 28px this row cannot take, and its `text-metadata` is not the meta row's
 * size either. Reaching for it here would reintroduce the layout shift the comment above describes.
 */
export function claimSlotPillClass(variant: 'inline' | 'block'): string {
  return cx(
    'items-center gap-1.5 rounded-full transition-colors',
    variant === 'block'
      ? // The position pills' own metrics: `min-h-7` and `text-button`, full width beneath them.
        'flex min-h-7 w-full justify-center px-3 text-button'
      : 'inline-flex h-5 shrink-0 px-2.5 text-[14px] leading-none'
  );
}

export function RequestDebateControl({
  onRequest,
  disabled = false,
  isRequesting = false,
  pending = false,
  pendingLabel,
  blockedReason,
  requestError,
  note,
  variant = 'inline',
  className,
}: {
  onRequest: () => void;
  disabled?: boolean;
  /** The request is in flight. Distinct from `pending`, which is waiting for the right to send it. */
  isRequesting?: boolean;
  /** Waiting on something before the offer can be made — the viewer's position reaching the server. */
  pending?: boolean;
  pendingLabel?: string | null;
  /** A standing condition the reader could work out for themselves. Ordinary text. */
  blockedReason?: string | null;
  /** An event with nothing else on screen to mark it. Announced. */
  requestError?: string | null;
  /** Anything else the host needs to say under the offer, e.g. "Recently rejected". */
  note?: React.ReactNode;
  /**
   * `inline` ends a meta row, where the offer is one item among several and has to be the height of
   * its neighbours. `block` stands under the position pills on the claim page, where it is the next
   * thing you do after taking a side — so it takes their full width and their height.
   */
  variant?: 'inline' | 'block';
  className?: string;
}) {
  const base = claimSlotPillClass(variant);
  const aside = cx('text-footnote', variant === 'block' ? 'text-left' : 'text-right');

  return (
    <span className={cx('flex flex-col gap-1', variant === 'block' ? 'w-full' : 'shrink-0 items-end', className)}>
      <button
        type="button"
        onClick={onRequest}
        disabled={disabled || isRequesting || pending}
        aria-busy={isRequesting || pending ? true : undefined}
        // Shown rather than left to a `title`: native tooltips never appear on touch and are
        // unreliable on a disabled button, which is exactly when the explanation matters.
        title={blockedReason ?? undefined}
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
            reads as something having gone wrong.

            Only while the offer is pressable. A pending label can be longer than "Request debate",
            and sizing against it would hold every idle button that much wider — in a meta row built
            not to grow. A press cannot happen while pending, which is the only transition the sizer
            exists to smooth. */}
        {pending ? (
          <span>{pendingLabel}</span>
        ) : (
          <span className="grid place-items-center">
            <span className="invisible col-start-1 row-start-1" aria-hidden>
              Request debate
            </span>
            <span className="col-start-1 row-start-1">{isRequesting ? 'Requesting…' : 'Request debate'}</span>
          </span>
        )}
      </button>
      {/* The button's own label changes, but a disabled control nobody is focused on announces
          nothing. This is what actually reaches a screen reader. */}
      {pending && !isRequesting ? (
        <span role="status" aria-live="polite" className="sr-only">
          {pendingLabel}
        </span>
      ) : null}
      {blockedReason ? <span className={cx(aside, 'text-grey-04')}>{blockedReason}</span> : null}
      {note}
      {/* A failed request is an event that happens after they press, with nothing on screen to mark
          it — `role="alert"` is what makes it reach anyone not watching this corner. */}
      {requestError ? (
        <span role="alert" className={cx(aside, 'text-red-01')}>
          {requestError}
        </span>
      ) : null}
    </span>
  );
}
