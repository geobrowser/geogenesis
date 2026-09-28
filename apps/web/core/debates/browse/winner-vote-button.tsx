'use client';

import * as React from 'react';

import cx from 'classnames';

import { Crown } from './icons';

/**
 * Figma "Winners voted on": the pill the viewer picked fills with this purple. It is a raw fill in
 * the frame rather than the `purple` token (`#6833FF`), so it stays an arbitrary value here.
 */
const PICKED_PURPLE = 'bg-[#9A4EFF]';

type WinnerVoteButtonProps = {
  /** Vote share for this debater, or null before the viewer has voted. */
  sharePercent: number | null;
  /** True for the debater this viewer picked. */
  isMyPick: boolean;
  disabled?: boolean;
  onVote: () => void;
  /** The debater this pill votes for, for the button's accessible name. */
  debaterName: string;
  className?: string;
  /** What the pill sits on: the video (`overlay`) or the white claims panel (`panel`). */
  surface?: 'overlay' | 'panel';
};

/**
 * The "Winner?" pill on a finished debate. Before the viewer votes it's a button; after, the
 * pick is a static share readout and the other debater stays clickable so the viewer can switch.
 */
export function WinnerVoteButton({
  sharePercent,
  isMyPick,
  disabled,
  onVote,
  debaterName,
  className,
  surface = 'overlay',
}: WinnerVoteButtonProps) {
  const hasVoted = sharePercent !== null;
  // leading-none after the variant gives the pill Figma's 28px height (6 + 16 + 6).
  const pill = 'flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-metadata leading-none';

  const stopAndVote = (event: React.MouseEvent) => {
    event.stopPropagation();
    onVote();
  };

  if (hasVoted && isMyPick) {
    return (
      <span className={cx(pill, PICKED_PURPLE, 'text-white', className)}>
        <Crown />
        <span>{sharePercent}%</span>
      </span>
    );
  }

  if (hasVoted) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={`Vote ${debaterName} as the winner`}
        onClick={stopAndVote}
        className={cx(
          pill,
          'text-text transition-colors disabled:opacity-60',
          surface === 'overlay' ? 'bg-white hover:bg-white/90' : 'bg-grey-02 hover:bg-grey-03',
          className
        )}
      >
        <Crown />
        <span>{sharePercent}%</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Vote ${debaterName} as the winner`}
      onClick={stopAndVote}
      className={cx(
        pill,
        'transition-colors disabled:opacity-60',
        surface === 'overlay'
          ? 'bg-white/40 text-white backdrop-blur-sm hover:bg-white/55'
          : 'bg-grey-01 text-grey-04 hover:bg-grey-02',
        className
      )}
    >
      <Crown />
      <span>Winner?</span>
    </button>
  );
}
