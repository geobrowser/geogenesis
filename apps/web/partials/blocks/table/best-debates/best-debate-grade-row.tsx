'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  GRADES,
  GRADE_DOWN_RANKED_COPY,
  GRADE_DOWN_RANK_TITLE,
  GRADE_IT_LABEL,
  GRADE_RANKING_FIRST_COPY,
  GRADE_REMOVE_LABEL,
  GRADE_ROW_LABEL,
  GRADE_SAVING_COPY,
  GRADE_UNDO_LABEL,
  type Grade,
  gradePlaceCopy,
} from '~/core/blocks/ranking/ranking-grades';
import { usePushDown } from '~/core/blocks/ranking/use-push-down';

import { SquareButton } from '~/design-system/button';
import { ChevronDown } from '~/design-system/icons/chevron-down';
import { ChevronUp } from '~/design-system/icons/chevron-up';

import type { BestDebatesGrading } from './best-debate-grading';

/**
 * The segments, shaped like the popup's 1x / 1.5x / 2x control (`SegmentedControl`, outline): equal
 * shares of one bordered track, the letter centred, the choice filled black. Disabled letters stay
 * readable (grey-04). 40px tall on a phone (`md:` is max-width).
 */
const SEGMENT_CLASS =
  'inline-flex h-7 min-w-0 flex-1 basis-0 items-center justify-center rounded-full text-metadata transition-colors md:h-10 disabled:cursor-default';
const SEGMENT_IDLE = 'text-text hover:bg-grey-01 disabled:text-grey-04 disabled:hover:bg-transparent';
const SEGMENT_SELECTED = 'bg-text text-white';
const LINK_CLASS = 'text-text underline underline-offset-2';

/**
 * The watch popup's grade row (GEO-3729): A, B and C put the debate at the top of that tier in the
 * ranker's ranking, D is Down rank. Under it: where the debate is, with ↑ / ↓ to fine-tune its place
 * (the placed dialog's arrows) and Remove; or Saving…; or Down ranked with Undo; or, on a ranking
 * with no grades yet, "Grade your ranking first".
 */
export function BestDebateGradeRow({ entityId, grading }: { entityId: string; grading: BestDebatesGrading }) {
  const pushDown = usePushDown(entityId);
  const grade = grading.gradeOf(entityId);
  const place = grading.placeOf(entityId);
  const saving = grading.isSaving(entityId);
  const downRanked = pushDown.isPushedDown && place === null;
  const pushDownWorking = pushDown.state.status === 'working';
  const gradesOff = !grading.ready || grading.needsTierLines;

  const choose = (next: Grade) => {
    if (next === grade && place !== null) return;
    grading.grade(entityId, next);
  };

  return (
    <div className="flex shrink-0 flex-col gap-2" data-testid="best-debate-grade-row">
      <div className="flex items-center gap-3">
        <span className="shrink-0 text-metadataMedium text-text md:hidden">{GRADE_ROW_LABEL}</span>
        {/* A group of toggle buttons, not a radio group: every press publishes (or edits the draft),
            so arrow keys mustn't select as they move. */}
        <div
          role="group"
          aria-label={GRADE_ROW_LABEL}
          className="flex min-w-0 flex-1 rounded-full border border-grey-02 p-0.5"
        >
          {GRADES.map(option => {
            const selected = grade === option && place !== null;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                disabled={gradesOff}
                onClick={() => choose(option)}
                data-geo-analytics-label={`grade_${option.toLowerCase()}`}
                data-geo-analytics-intent="grade_debate"
                className={cx(SEGMENT_CLASS, selected ? SEGMENT_SELECTED : SEGMENT_IDLE)}
              >
                {option}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={downRanked}
            title={GRADE_DOWN_RANK_TITLE}
            aria-label={`D, ${GRADE_DOWN_RANK_TITLE}`}
            // Down ranked stays pressed and readable; Undo below takes it back.
            disabled={!downRanked && (!grading.ready || pushDownWorking || !pushDown.isVoteKnown)}
            onClick={() => {
              if (!downRanked) grading.downRank(entityId);
            }}
            data-geo-analytics-label="grade_d"
            data-geo-analytics-intent="down_rank"
            className={cx(SEGMENT_CLASS, downRanked ? SEGMENT_SELECTED : SEGMENT_IDLE)}
          >
            D
          </button>
        </div>
      </div>
      <div className="flex min-h-8 items-center gap-2 text-metadata text-grey-04" aria-live="polite">
        {pushDownWorking ? (
          <span>{GRADE_SAVING_COPY}</span>
        ) : downRanked ? (
          <>
            <span>{GRADE_DOWN_RANKED_COPY}</span>
            <button
              type="button"
              className={LINK_CLASS}
              onClick={() => {
                void pushDown.undo();
                grading.undoDownRank?.(entityId);
              }}
              data-geo-analytics-label="grade_undo_down_rank"
            >
              {GRADE_UNDO_LABEL}
            </button>
          </>
        ) : grading.needsTierLines ? (
          <>
            <span>{GRADE_RANKING_FIRST_COPY}</span>
            {grading.onGradeYourRanking ? (
              <button
                type="button"
                className={LINK_CLASS}
                onClick={grading.onGradeYourRanking}
                data-geo-analytics-label="grade_your_ranking"
              >
                {GRADE_IT_LABEL}
              </button>
            ) : null}
          </>
        ) : place !== null ? (
          <>
            <span className="tabular-nums">{gradePlaceCopy(place)}</span>
            {/* The placed dialog's arrows; presses during a save keep coming (they go out together). */}
            <span className="flex items-center gap-1">
              <SquareButton
                icon={<ChevronUp />}
                aria-label="Move up"
                disabled={!grading.ready || place <= 1}
                onClick={() => grading.move(entityId, -1)}
                className="md:!size-11"
              />
              <SquareButton
                icon={<ChevronDown />}
                aria-label="Move down"
                disabled={!grading.ready || place >= grading.count}
                onClick={() => grading.move(entityId, 1)}
                className="md:!size-11"
              />
            </span>
            <button
              type="button"
              className={cx(LINK_CLASS, 'ml-1')}
              onClick={() => grading.remove(entityId)}
              data-geo-analytics-label="grade_clear"
            >
              {GRADE_REMOVE_LABEL}
            </button>
            {saving ? <span>{GRADE_SAVING_COPY}</span> : null}
          </>
        ) : saving ? (
          <span>{GRADE_SAVING_COPY}</span>
        ) : null}
      </div>
    </div>
  );
}
