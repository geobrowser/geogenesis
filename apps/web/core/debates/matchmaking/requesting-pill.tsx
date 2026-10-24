'use client';

import * as React from 'react';

import cx from 'classnames';

import { useAskClock } from './use-outgoing-ask';

/**
 * "Requesting · m:ss", in place of the Debate now that sent it (GEO-3463): a claim card's end slot
 * and a People row both draw it, at their own size, so the caller passes the pill's classes.
 *
 * `role="timer"` rather than a status: a timer is not announced on every tick, where a polite live
 * region whose text changes each second would read out every second of the countdown.
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
  const seconds = Math.ceil(remainingMs / 1_000);
  return (
    <span
      role="timer"
      aria-label={`Requesting${who ? ` ${who}` : ''}, ${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`}
      className={cx('tabular-nums', className)}
    >
      Requesting · {label}
    </span>
  );
}
