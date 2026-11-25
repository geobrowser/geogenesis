'use client';

import * as React from 'react';

import cx from 'classnames';

import { type SplitBreakdown, type SplitRow, type VoteControlModel, formatPercentInt } from '../models';
import { DebateVoteButtons } from './debate-vote-buttons';
import { SplitBars } from './split-bars';
import { TEMPLATE_CARD_SURFACE } from './template-shell';

export interface VoteBoxProps {
  /** Optional prompt displayed above the buttons (e.g. "This is an accurate account of what happened"). */
  prompt?: string;
  split: SplitBreakdown;
  control: VoteControlModel;
  className?: string;
}

/**
 * Interactive Agree / Disagree card, the hero vote on a Claim page. The buttons are the debates
 * app's (GEO-3845), see `debate-vote-buttons.tsx`.
 *
 * It leads with the result: a large percentage with its unit ("71% agree") and the vote count in
 * quiet gray, the buttons at the right of that line, and a split bar across the whole card under it
 * (the agree share in the row's ink, the rest in light gray) with "Agree" / "Disagree" shares at its
 * ends. With no votes the headline is a quiet "No votes yet" over an empty bar. A lone split row
 * draws no space label: the headline is its result. Several spaces add a compact per-space list
 * under the bar, the overall ("Everyone") row leading as the headline when there is one. Under a
 * 680px container the result stacks over the bar and the buttons span the card.
 */
export function VoteBox({ prompt, split, control, className }: VoteBoxProps) {
  const { userVote, countSummary, hint, impactNote, disabled, onVote, onClear } = control;
  // Pressing the filled button takes the vote back and the other one switches it, so the buttons
  // alone change or clear a vote. The filled button is the only "your vote" mark: no "You: Agree"
  // pill and no "You agreed. Change" line, at any width (GEO-3837).
  const press = (choice: 'agree' | 'disagree') => {
    if (userVote === choice && onClear) onClear();
    else onVote(choice);
  };

  const rows = split.rows;
  // One row is the result. With several, the overall row is the headline and the spaces list under
  // the bar; with no overall row every space goes in the list, so no unlabeled bar stands for one.
  const headlineRow = rows.length === 1 ? rows[0] : rows.find(row => row.isEveryone);
  const listRows = rows.filter(row => row !== headlineRow);
  const noVotes = rows.length === 0;

  return (
    <section
      aria-label={prompt ?? 'Vote on this claim'}
      className={cx(
        'flex flex-col gap-4 p-5 @max-[300px]:p-4 @[680px]:gap-5 @[680px]:p-6',
        TEMPLATE_CARD_SURFACE,
        className
      )}
    >
      {prompt && <p className="m-0 text-smallTitle text-text">{prompt}</p>}

      {/* Wide: the result and the buttons share a line, the bar spans the card under them. Phones: the
          result, then the bar, then the buttons across the card. */}
      <div className="flex flex-col gap-4 @[680px]:flex-row @[680px]:flex-wrap @[680px]:items-end @[680px]:justify-between @[680px]:gap-x-6 @[680px]:gap-y-5">
        <Headline row={headlineRow} countSummary={countSummary} noVotes={noVotes} />

        <DebateVoteButtons
          userVote={userVote}
          disabled={disabled}
          label="Do you agree?"
          onPress={press}
          className="order-3 w-full shrink-0 @[680px]:order-2 @[680px]:w-auto"
          // On the narrowest phones (320px) the pill padding gives way so "Disagree" is not cut off.
          buttonClassName="flex-1 basis-0 @max-[300px]:px-2 @[680px]:min-w-[124px] @[680px]:flex-none"
        />

        <ResultBar row={headlineRow} noVotes={noVotes} className="order-2 @[680px]:order-3 @[680px]:basis-full" />
      </div>

      {listRows.length > 0 && (
        <SplitBars
          rows={listRows}
          density="compact"
          className="w-full border-t border-divider pt-4 @[680px]:max-w-[560px]"
        />
      )}

      {(impactNote || (!userVote && hint)) && (
        <div className="flex flex-col gap-1 text-[13.5px] leading-[19px] text-grey-04">
          {impactNote && <span className="text-text">{impactNote}</span>}
          {!userVote && hint && <span>{hint}</span>}
        </div>
      )}
    </section>
  );
}

/**
 * The lead result: "71% agree · 7 votes", the percentage large and bold. Without an overall row it
 * is the count alone, large and quiet ("No votes yet" when nobody has voted).
 */
function Headline({ row, countSummary, noVotes }: { row?: SplitRow; countSummary: string; noVotes: boolean }) {
  const quietText = countSummary || (noVotes ? 'No votes yet' : '');
  if (!row && !quietText) return null;
  return (
    <div
      data-testid="vote-box-result"
      className="order-1 flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 tabular-nums"
    >
      {row ? (
        <>
          <span className="flex items-baseline gap-2">
            <strong className="text-[40px] leading-[44px] font-medium tracking-[-0.03em] text-text">
              {formatPercentInt(row.percent)}
            </strong>
            <span className="text-[17px] leading-[24px] font-semibold text-text">{row.unit ?? 'agree'}</span>
          </span>
          {countSummary && (
            <span className="text-[15px] leading-[22px] text-grey-04">
              <span aria-hidden className="mr-2.5">
                ·
              </span>
              {countSummary}
            </span>
          )}
        </>
      ) : (
        <span
          className={cx(
            'font-semibold tracking-[-0.02em] text-grey-04',
            noVotes ? 'text-[28px] leading-[44px]' : 'text-[22px] leading-[30px]'
          )}
        >
          {quietText}
        </span>
      )}
    </div>
  );
}

/**
 * The split across the card: the agree share in the row's ink over a light gray track, with no share
 * labels under it (the result above says it). With no votes it is an empty track and no meter.
 * With several spaces and no overall row it draws nothing (the list carries the bars).
 */
function ResultBar({ row, noVotes, className }: { row?: SplitRow; noVotes: boolean; className?: string }) {
  if (!row) {
    if (!noVotes) return null;
    return (
      <div
        data-testid="vote-box-empty-bar"
        aria-hidden
        className={cx('h-2.5 w-full rounded-full bg-grey-01', className)}
      />
    );
  }
  const clamped = Math.max(0, Math.min(100, row.percent));
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      <div
        role="meter"
        aria-label={`${row.label} ${row.unit ?? 'agree'}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="block h-2.5 w-full overflow-hidden rounded-full bg-grey-02"
      >
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{ width: `${clamped.toFixed(2)}%`, backgroundColor: row.color }}
        />
      </div>
    </div>
  );
}
