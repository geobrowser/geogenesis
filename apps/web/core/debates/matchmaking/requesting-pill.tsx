'use client';

import * as React from 'react';

import cx from 'classnames';

import { useAskClock } from './use-outgoing-ask';

/**
 * An ask's countdown, read out as the seconds left. `role="timer"` rather than a status: a timer is
 * not announced on every tick, where a polite live region whose text changes each second would read
 * out every second of the countdown — and a role-less span's `aria-label` is ignored. The caller
 * runs the clock (`useAskClock`), since the strip also draws its bar off it.
 */
export function AskTimer({
  remainingMs,
  name,
  className,
  children,
}: {
  remainingMs: number;
  /** Said before the time left, e.g. "Requesting Mia". */
  name?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const seconds = Math.ceil(remainingMs / 1_000);
  return (
    <span
      role="timer"
      aria-label={`${name ? `${name}, ` : ''}${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
      className={cx('tabular-nums', className)}
    >
      {children}
    </span>
  );
}

/**
 * "Requesting · m:ss", in place of the Debate now that sent it (GEO-3463): a claim card's end slot
 * and a People row both draw it, at their own size, so the caller passes the pill's classes.
 */
export function RequestingPill({
  expiresAt,
  who,
  className,
}: {
  expiresAt: string;
  /** Who was asked, for the accessible name, when the pill sits on that person's row. */
  who?: string;
  className?: string;
}) {
  const { remainingMs, label } = useAskClock(expiresAt);
  return (
    <AskTimer remainingMs={remainingMs} name={`Requesting${who ? ` ${who}` : ''}`} className={className}>
      Requesting · {label}
    </AskTimer>
  );
}
