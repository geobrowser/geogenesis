'use client';

import * as React from 'react';

import cx from 'classnames';

import {
  GRADES,
  GRADE_DOWN_RANK_TITLE,
  GRADE_RANKING_FIRST_COPY,
  GRADE_ROW_LABEL,
} from '~/core/blocks/ranking/ranking-grades';

import { Menu } from '~/design-system/menu';

import { useBestDebatesGrading } from './best-debate-grading';

/** The row buttons' shape: Rank and Grade, side by side (44px tall on a phone). */
export const ROW_ACTION_BUTTON_CLASS =
  'inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-grey-02 bg-white px-3 text-metadata text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:px-4';

const ITEM_CLASS =
  'flex w-full items-center gap-3 rounded px-3 py-2 text-left text-button text-text hover:bg-grey-01 disabled:cursor-default disabled:text-grey-04 disabled:hover:bg-transparent md:py-3';

/**
 * Grade a debate straight from a list row (GEO-3729): A, B or C puts it at the top of that tier in
 * the ranker's ranking, D is Down rank. The same grading as the watch popup's row, from whichever
 * surface the row is on (`BestDebatesGradingContext`); nothing when there is none (not a ranker).
 */
export function GradeMenuButton({ entityId, name }: { entityId: string; name: string }) {
  const grading = useBestDebatesGrading();
  const [open, setOpen] = React.useState(false);
  if (!grading) return null;
  const gradesOff = !grading.ready || grading.needsTierLines;
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <span onClick={stop} onKeyDown={stop} onPointerDown={stop}>
      <Menu
        open={open}
        onOpenChange={setOpen}
        align="end"
        className="w-48 p-1"
        trigger={
          <span className={ROW_ACTION_BUTTON_CLASS} data-geo-analytics-label="Best debates row grade">
            {GRADE_ROW_LABEL}
          </span>
        }
      >
        <div role="menu" aria-label={`Grade ${name}`} className="flex flex-col">
          {grading.needsTierLines ? (
            <p className="m-0 px-3 py-2 text-footnote text-grey-04">{GRADE_RANKING_FIRST_COPY}</p>
          ) : null}
          {GRADES.map(grade => (
            <button
              key={grade}
              type="button"
              role="menuitem"
              disabled={gradesOff}
              className={ITEM_CLASS}
              data-geo-analytics-label={`grade_${grade.toLowerCase()}`}
              data-geo-analytics-intent="grade_debate"
              onClick={() => {
                setOpen(false);
                grading.grade(entityId, grade, 'list');
              }}
            >
              <span className="w-4 text-center font-medium">{grade}</span>
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            disabled={!grading.ready}
            className={cx(ITEM_CLASS)}
            data-geo-analytics-label="grade_d"
            data-geo-analytics-intent="down_rank"
            onClick={() => {
              setOpen(false);
              grading.downRank(entityId);
            }}
          >
            <span className="w-4 text-center font-medium">D</span>
            <span className="text-grey-04">{GRADE_DOWN_RANK_TITLE}</span>
          </button>
        </div>
      </Menu>
    </span>
  );
}
