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
 * Interactive Agree / Disagree card. The buttons are the debates app's (GEO-3845), see
 * `debate-vote-buttons.tsx`.
 *
 * One column, in the claim-row style (GEO-3845): Agree / Disagree with the result grouped beside them
 * ("bar 71% · 7 votes"), so no half of the card sits empty. A lone split row draws no label: its bar
 * is the result. Several spaces add a compact per-space list under the button line, led inline by
 * the overall ("Everyone") row when there is one. Phones put the result on its own line under the
 * full-width buttons.
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
  // One row is the result. With several, the overall row leads inline and the spaces list under it;
  // with no overall row every space goes in the list, so no unlabeled bar stands for one of them.
  const inlineRow = rows.length === 1 ? rows[0] : rows.find(row => row.isEveryone);
  const listRows = rows.filter(row => row !== inlineRow);
  const hasResult = Boolean(inlineRow) || Boolean(countSummary);

  return (
    <section
      aria-label={prompt ?? 'Vote on this claim'}
      className={cx('flex flex-col gap-4 p-5 @[560px]:p-6', TEMPLATE_CARD_SURFACE, className)}
    >
      {prompt && <p className="m-0 text-smallTitle text-text">{prompt}</p>}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <DebateVoteButtons
          userVote={userVote}
          disabled={disabled}
          label="Do you agree?"
          onPress={press}
          className="w-full @[560px]:w-auto"
          buttonClassName="flex-1 basis-0 @[560px]:min-w-[116px] @[560px]:flex-none"
        />

        {hasResult && (
          <div
            data-testid="vote-box-result"
            className="flex min-w-0 flex-1 basis-full items-center gap-x-2 gap-y-1 text-[14px] leading-[20px] text-grey-04 tabular-nums @[560px]:basis-auto"
          >
            {inlineRow && <ResultBar row={inlineRow} />}
            {inlineRow && countSummary && <span aria-hidden>·</span>}
            {countSummary && <span className="whitespace-nowrap">{countSummary}</span>}
          </div>
        )}
      </div>

      {listRows.length > 0 && <SplitBars rows={listRows} density="compact" className="w-full max-w-[420px]" />}

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
 * The result beside the buttons: a bar and its bold percentage. 140px on wide cards, as in the claim
 * rows; on phones it takes the line's spare width.
 */
function ResultBar({ row }: { row: SplitRow }) {
  const clamped = Math.max(0, Math.min(100, row.percent));
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5 @[560px]:flex-none">
      <span
        role="meter"
        aria-label={`${row.label} ${row.unit ?? 'agree'}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="block h-2 min-w-[48px] flex-1 overflow-hidden rounded-full bg-grey-01 @[560px]:w-[140px] @[560px]:flex-none"
      >
        <span
          className="block h-full rounded-full transition-[width] duration-200"
          style={{ width: `${clamped.toFixed(2)}%`, backgroundColor: row.color }}
        />
      </span>
      <strong className="font-semibold text-text">{formatPercentInt(clamped)}</strong>
    </span>
  );
}
