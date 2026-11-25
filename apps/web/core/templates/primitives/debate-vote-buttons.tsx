'use client';

import * as React from 'react';

import cx from 'classnames';

import type { VoteChoice } from '../models';
import { DebateVoteIcon } from './icons';

type Side = Exclude<VoteChoice, null>;

/**
 * The Agree / Disagree button from the debates app (debates.geobrowser.io), ported from
 * debates-react-native `src/components/VoteChoice.tsx` + `src/domain/voteControls.ts` and its web
 * press/hover feedback (`src/components/Motion.tsx` MotionPressable, `public/button-feedback.css`):
 * an outlined pill (34px compact, 36px default, not the app's 44px) on a transparent ground, a 1px #8a8a8a border that turns ink (#151515) on the
 * viewer's side, an outline thumb that fills on that side, a label at 600 (700 selected) with
 * -0.3px tracking in the app's system font, a 0.97 press scale, a 6% ink hover wash and a 2px #747474
 * focus ring. `compact` is the claim-row size (18px icon, 14px label, the app's label size); the
 * default is the vote box's (20px icon, 15px label). Disabled dims to 50%, as the app's dimmed state.
 */
export function DebateVoteButton({
  choice,
  selected,
  disabled = false,
  compact = false,
  title,
  onPress,
  className,
}: {
  choice: Side;
  selected: boolean;
  disabled?: boolean;
  compact?: boolean;
  title?: string;
  onPress: () => void;
  className?: string;
}) {
  const label = choice === 'agree' ? 'Agree' : 'Disagree';
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      title={title}
      onClick={onPress}
      className={cx(
        'relative inline-flex min-w-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border bg-transparent whitespace-nowrap text-[#151515] transition-transform duration-150 ease-out select-none active:scale-[0.97]',
        // Hover paints a wash over the pill without moving it (the app's button-feedback.css).
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-[rgb(21_21_21/6%)] after:opacity-0 after:transition-opacity after:duration-[140ms] after:content-[''] enabled:hover:after:opacity-100 motion-reduce:transition-none motion-reduce:after:transition-none",
        'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#747474]',
        'disabled:cursor-default disabled:opacity-50 disabled:active:scale-100',
        // Below the app's 44px, which read too tall on the page (Preston, GEO-3845): 34px in claim rows,
        // 36px in the vote box. The label, icon and padding follow the app's, so the buttons read as
        // heavy as the app's (Yaniv, GEO-3857).
        compact ? 'h-[34px] gap-1 px-3.5 text-[14px]' : 'h-9 gap-1.5 px-4 text-[15px]',
        // The app sets no font, so its web build draws labels in the system face (SF on Apple
        // devices), which reads heavier than Calibre at the same size.
        "[font-family:-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] tracking-[-0.3px]",
        selected ? 'border-[#151515] font-bold' : 'border-[#8a8a8a] font-semibold',
        className
      )}
    >
      <DebateVoteIcon choice={choice} filled={selected} className={compact ? 'size-[18px]' : 'size-5'} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The app's Agree / Disagree row: two equal buttons 6px apart. Pressing the held side takes the vote
 * back and pressing the other side switches it; that is the caller's `onPress`.
 */
export function DebateVoteButtons({
  userVote,
  disabled = false,
  compact = false,
  label,
  titleFor,
  onPress,
  className,
  buttonClassName,
}: {
  userVote: VoteChoice;
  disabled?: boolean;
  compact?: boolean;
  /** Accessible name of the group, e.g. "Vote on <claim>". */
  label?: string;
  titleFor?: (choice: Side) => string | undefined;
  onPress: (choice: Side) => void;
  className?: string;
  /** Width rule for each button; defaults to an equal share of the row. */
  buttonClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx('flex items-center gap-1.5', className)}>
      {(['agree', 'disagree'] as const).map(choice => (
        <DebateVoteButton
          key={choice}
          choice={choice}
          selected={userVote === choice}
          disabled={disabled}
          compact={compact}
          title={titleFor?.(choice)}
          onPress={() => onPress(choice)}
          className={buttonClassName ?? 'flex-1 basis-0'}
        />
      ))}
    </div>
  );
}
