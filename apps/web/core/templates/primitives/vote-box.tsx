'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SplitBreakdown, VoteControlModel } from '../models';
import { SplitBars } from './split-bars';

export interface VoteBoxProps {
  /** Optional prompt displayed above the bars (e.g. "This is an accurate account of what happened"). */
  prompt?: string;
  split: SplitBreakdown;
  control: VoteControlModel;
  className?: string;
}

/**
 * Interactive Agree / Disagree voting card paired with community + overall split bars.
 */
export function VoteBox({ prompt, split, control, className }: VoteBoxProps) {
  const { userVote, countSummary, hint, impactNote, disabled, onVote, onClear } = control;

  return (
    <section
      aria-label={prompt ?? 'Vote on this claim'}
      className={cx('flex flex-col gap-5 rounded-xl border border-grey-02/80 bg-white p-5 @[560px]:p-6', className)}
    >
      {prompt && <p className="m-0 text-smallTitle text-text">{prompt}</p>}

      <SplitBars rows={split.rows} density="full" />

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={userVote === 'agree'}
          onClick={() => onVote('agree')}
          className={cx(
            'inline-flex h-10 cursor-pointer items-center justify-center rounded-full border px-5 text-button transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            userVote === 'agree'
              ? 'border-text bg-text text-white'
              : 'border-grey-02 bg-white text-text hover:border-text'
          )}
        >
          Agree
        </button>

        <button
          type="button"
          disabled={disabled}
          aria-pressed={userVote === 'disagree'}
          onClick={() => onVote('disagree')}
          className={cx(
            'inline-flex h-10 cursor-pointer items-center justify-center rounded-full border px-5 text-button transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            userVote === 'disagree'
              ? 'border-text bg-text text-white'
              : 'border-grey-02 bg-white text-text hover:border-text'
          )}
        >
          Disagree
        </button>

        {userVote && (
          <div className="flex items-center gap-2.5 text-[15px] text-grey-04">
            <span className="font-medium text-text">{userVote === 'agree' ? 'You agreed.' : 'You disagreed.'}</span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="cursor-pointer border-0 bg-transparent p-0 text-[15px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                Change
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-divider pt-3.5 text-[15px] leading-[22px] text-grey-04">
        <span>{countSummary}</span>
        {impactNote && <span className="text-text">{impactNote}</span>}
        {!userVote && hint && <span>{hint}</span>}
      </div>
    </section>
  );
}
