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
 * Interactive Agree / Disagree voting box paired with community + overall split bars.
 *
 * Pure controlled component: callers decide whether voting mutates live Geo responses,
 * opens sign-in, or updates local fixture state.
 */
export function VoteBox({ prompt, split, control, className }: VoteBoxProps) {
  const { userVote, countSummary, hint, impactNote, disabled, onVote, onClear } = control;

  return (
    <section
      aria-label={prompt ?? 'Vote on this claim'}
      className={cx('flex flex-col gap-4 rounded-xl border border-grey-02/70 bg-white p-4 @[560px]:p-5', className)}
    >
      {prompt && <p className="m-0 text-bodySemibold text-text">{prompt}</p>}

      <SplitBars rows={split.rows} density="full" />

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={disabled}
          aria-pressed={userVote === 'agree'}
          onClick={() => onVote('agree')}
          className={cx(
            'inline-flex h-9 cursor-pointer items-center justify-center rounded-full border px-4 text-button transition-colors disabled:cursor-not-allowed disabled:opacity-50',
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
            'inline-flex h-9 cursor-pointer items-center justify-center rounded-full border px-4 text-button transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            userVote === 'disagree'
              ? 'border-text bg-text text-white'
              : 'border-grey-02 bg-white text-text hover:border-text'
          )}
        >
          Disagree
        </button>

        {userVote && (
          <div className="flex items-center gap-2 text-[13px] text-grey-04">
            <span className="font-medium text-text">{userVote === 'agree' ? 'You agreed.' : 'You disagreed.'}</span>
            {onClear && (
              <button
                type="button"
                onClick={onClear}
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-ctaPrimary hover:text-ctaHover"
              >
                Change
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[13px] leading-[18px] text-grey-04">
        <span>{countSummary}</span>
        {impactNote && <span className="text-text">{impactNote}</span>}
        {!userVote && hint && <span>{hint}</span>}
      </div>
    </section>
  );
}
