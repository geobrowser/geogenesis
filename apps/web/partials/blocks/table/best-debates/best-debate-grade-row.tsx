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

import type { BestDebatesGrading } from './best-debate-grading';

/** 32px pills on desktop, 44px targets sharing the row on phones (`md:` is max-width). */
const PILL_CLASS =
  'h-8 w-10 shrink-0 rounded-full border text-button font-medium transition-colors disabled:cursor-default disabled:opacity-50 md:h-11 md:w-auto md:flex-1';
const PILL_IDLE = 'border-grey-02 bg-white text-text hover:border-text';
const PILL_SELECTED = 'border-text bg-text text-white';
const PILL_DOWN_RANKED = 'border-red-01 bg-red-02 text-red-01';
const LINK_CLASS = 'text-text underline underline-offset-2';

/**
 * The watch popup's grade row (GEO-3729, mockup approved 13 Nov): A, B and C place the debate at the
 * bottom of that tier in the ranker's ranking, D is Down rank. Under the pills: where it landed,
 * with Remove; or Saving…; or Down ranked with Undo; or, on a ranking that has no grades yet,
 * "Grade your ranking first".
 */
export function BestDebateGradeRow({ entityId, grading }: { entityId: string; grading: BestDebatesGrading }) {
  const pushDown = usePushDown(entityId);
  const grade = grading.gradeOf(entityId);
  const place = grading.placeOf(entityId);
  const saving = grading.isSaving(entityId);
  const downRanked = pushDown.isPushedDown && place === null;
  const pushDownWorking = pushDown.state.status === 'working';
  const gradesOff = !grading.ready || grading.needsTierLines || saving;

  const choose = (next: Grade) => {
    if (next === grade && place !== null) return;
    grading.grade(entityId, next);
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5" data-testid="best-debate-grade-row">
      <div role="radiogroup" aria-label={GRADE_ROW_LABEL} className="flex items-center gap-2">
        <span className="mr-1 text-metadataMedium text-text md:hidden">{GRADE_ROW_LABEL}</span>
        {GRADES.map(option => {
          const selected = grade === option && place !== null;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={gradesOff}
              onClick={() => choose(option)}
              data-geo-analytics-label={`grade_${option.toLowerCase()}`}
              data-geo-analytics-intent="grade_debate"
              className={cx(PILL_CLASS, selected ? PILL_SELECTED : PILL_IDLE)}
            >
              {option}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={downRanked}
          title={GRADE_DOWN_RANK_TITLE}
          aria-label={`D, ${GRADE_DOWN_RANK_TITLE}`}
          disabled={!grading.ready || saving || pushDownWorking || !pushDown.isVoteKnown || downRanked}
          onClick={() => grading.downRank(entityId)}
          data-geo-analytics-label="grade_d"
          data-geo-analytics-intent="down_rank"
          className={cx(PILL_CLASS, downRanked ? PILL_DOWN_RANKED : PILL_IDLE, downRanked && 'disabled:opacity-100')}
        >
          D
        </button>
      </div>
      <div className="flex min-h-5 items-center gap-3 text-metadata text-grey-04" aria-live="polite">
        {saving || pushDownWorking ? (
          <span>{GRADE_SAVING_COPY}</span>
        ) : downRanked ? (
          <>
            <span>{GRADE_DOWN_RANKED_COPY}</span>
            <button
              type="button"
              className={LINK_CLASS}
              onClick={() => void pushDown.undo()}
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
            <span>{gradePlaceCopy(place)}</span>
            <button
              type="button"
              className={LINK_CLASS}
              onClick={() => grading.remove(entityId)}
              data-geo-analytics-label="grade_clear"
            >
              {GRADE_REMOVE_LABEL}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
