'use client';

import * as React from 'react';

import cx from 'classnames';

import type { SplitBreakdown, VoteControlModel } from '../models';
import { ThumbDownIcon, ThumbUpIcon } from './icons';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface VoteBoxProps {
  /** Optional prompt displayed above the bars (e.g. "This is an accurate account of what happened"). */
  prompt?: string;
  split: SplitBreakdown;
  control: VoteControlModel;
  className?: string;
}

/**
 * Interactive Agree / Disagree voting card paired with community + overall split bars.
 *
 * Uses a balanced 2-column horizontal layout at desktop widths (bars left, voting controls right)
 * inside a soft-shadow, whisper-border Geo card surface.
 */
export function VoteBox({ prompt, split, control, className }: VoteBoxProps) {
  const { userVote, countSummary, hint, impactNote, disabled, onVote, onClear } = control;

  return (
    <section
      aria-label={prompt ?? 'Vote on this claim'}
      className={cx(
        'flex min-h-[104px] flex-col justify-center gap-5 p-5 @[560px]:p-6',
        TEMPLATE_CARD_SURFACE,
        className
      )}
    >
      {prompt && <p className="m-0 text-smallTitle text-text">{prompt}</p>}

      <div
        className={cx(
          'grid grid-cols-1 items-start gap-6',
          split.rows.length > 0 && '@[680px]:grid-cols-[minmax(0,1fr)_344px]'
        )}
      >
        {split.rows.length > 0 && (
          <div className="min-w-0">
            <SplitBars rows={split.rows} density="full" />
          </div>
        )}

        <div
          className={cx(
            'flex flex-col gap-3',
            split.rows.length > 0 &&
              'border-t border-divider pt-4 @[680px]:border-t-0 @[680px]:border-l @[680px]:pt-0 @[680px]:pl-6'
          )}
        >
          <span className="text-[13.5px] font-medium text-grey-04">Do you agree?</span>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={userVote === 'agree'}
              onClick={() => onVote('agree')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                userVote === 'agree'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <ThumbUpIcon className="size-3.5" />
              <span>Agree</span>
            </button>

            <button
              type="button"
              disabled={disabled}
              aria-pressed={userVote === 'disagree'}
              onClick={() => onVote('disagree')}
              className={cx(
                'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                userVote === 'disagree'
                  ? 'border-text bg-text text-white'
                  : 'border-grey-02 bg-white text-text hover:border-text'
              )}
            >
              <ThumbDownIcon className="size-3.5" />
              <span>Disagree</span>
            </button>

            {countSummary && (
              <span className="ml-auto text-[13.5px] whitespace-nowrap text-grey-04 tabular-nums">{countSummary}</span>
            )}
          </div>

          {userVote && (
            <div className="flex items-center gap-2.5 text-[14.5px] text-grey-04">
              <span className="font-medium text-text">{userVote === 'agree' ? 'You agreed.' : 'You disagreed.'}</span>
              {onClear && (
                <button
                  type="button"
                  onClick={onClear}
                  className="cursor-pointer border-0 bg-transparent p-0 text-[14.5px] font-medium text-ctaPrimary hover:text-ctaHover"
                >
                  Change
                </button>
              )}
            </div>
          )}

          {(impactNote || (!userVote && hint)) && (
            <div className="flex flex-col gap-1 text-[13.5px] leading-[19px] text-grey-04">
              {impactNote && <span className="text-text">{impactNote}</span>}
              {!userVote && hint && <span>{hint}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
