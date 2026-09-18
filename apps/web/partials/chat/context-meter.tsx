'use client';

import * as React from 'react';

import cx from 'classnames';

import { Tooltip } from '~/design-system/tooltip';

type Props = {
  /**
   * How full the conversation is against the point where it summarizes itself,
   * 0-1. The meter is only rendered once this is worth showing, so the caller
   * decides visibility — see `OFFER_COMPACT_AT_INPUT_TOKENS`.
   */
  fraction: number;
  /** Omitted while a turn is running: the ring stays, the click doesn't. */
  onCompact?: () => void;
};

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Where the ring stops being ambient and starts being a prompt to act.
const WARN_AT = 0.85;

/**
 * A filling ring beside the send button showing how full the chat is, and a
 * one-click way to summarize it.
 *
 * A ring rather than a labelled menu item because the state it reports is
 * continuous — "how much room is left" — and a word in a menu can only say
 * "available" or "not available". Reading a half-filled circle needs no
 * explanation; "Summarize chat" needs one.
 */
export function ContextMeter({ fraction, onCompact }: Props) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const percent = Math.round(clamped * 100);
  const isNearlyFull = clamped >= WARN_AT;

  return (
    <Tooltip
      position="top"
      align="end"
      label={
        onCompact
          ? `This chat is ${percent}% full. Summarize it to keep going — the full version stays in Previous chats.`
          : `This chat is ${percent}% full.`
      }
      trigger={
        <button
          type="button"
          onClick={onCompact}
          disabled={!onCompact}
          aria-label={`Summarize chat. Conversation is ${percent}% of the way to summarizing itself.`}
          className={cx(
            'shrink-0 transition-colors',
            isNearlyFull ? 'text-orange' : 'text-grey-03',
            onCompact ? 'enabled:hover:text-ctaPrimary' : 'cursor-default'
          )}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="8" cy="8" r={RADIUS} stroke="currentColor" strokeWidth="2" opacity="0.25" />
            <circle
              cx="8"
              cy="8"
              r={RADIUS}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
              transform="rotate(-90 8 8)"
            />
          </svg>
        </button>
      }
    />
  );
}
