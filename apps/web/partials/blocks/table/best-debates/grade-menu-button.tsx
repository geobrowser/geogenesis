'use client';

import * as React from 'react';

import {
  GRADES,
  GRADE_DOWN_RANK_TITLE,
  GRADE_IT_LABEL,
  GRADE_RANKING_FIRST_COPY,
  GRADE_ROW_LABEL,
} from '~/core/blocks/ranking/ranking-grades';

import { Stars } from '~/design-system/icons/stars';
import { Menu } from '~/design-system/menu';

import { useBestDebatesGrading } from './best-debate-grading';

/** The rows' square icon buttons: Rank (the ranking chart) and Grade beside it (44px on a phone). */
export const ROW_ICON_BUTTON_CLASS =
  'grid size-8 shrink-0 place-items-center rounded-md border border-grey-02 bg-white text-text transition-colors hover:border-text disabled:cursor-not-allowed disabled:opacity-50 md:size-11';

/** The rows of the Grade menu, as `DebateOverflowMenu` draws its items. */
const ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-3 bg-white px-3 py-2.5 text-left text-button text-text hover:bg-bg disabled:cursor-default disabled:text-grey-04 disabled:hover:bg-white';

/**
 * Grade a debate straight from a list row (GEO-3729): A, B or C puts it at the top of that tier in
 * the ranker's ranking, D is Down rank. The same grading as the watch popup's row, from whichever
 * surface the row is on (`BestDebatesGradingContext`); nothing when there is none (not a ranker).
 * Built as `DebateOverflowMenu` builds its menu: a real button as the trigger, plain buttons inside.
 */
export function GradeMenuButton({ entityId, name }: { entityId: string; name: string }) {
  const grading = useBestDebatesGrading();
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  if (!grading) return null;
  const gradesOff = !grading.ready || grading.needsTierLines;
  // The rows open the debate to watch on a press, and some can be dragged: neither from here.
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={`Grade ${name}`}
      title={GRADE_ROW_LABEL}
      draggable={false}
      data-geo-analytics-label="Best debates row grade"
      data-geo-analytics-intent="grade_debate"
      className={ROW_ICON_BUTTON_CLASS}
    >
      <Stars />
    </button>
  );

  return (
    <span onClick={stop} onKeyDown={stop} onPointerDown={stop} onDragStart={stop} className="contents">
      <Menu
        open={open}
        onOpenChange={setOpen}
        asChild
        align="end"
        className="w-44"
        triggerRef={triggerRef}
        trigger={trigger}
      >
        {grading.needsTierLines ? (
          <p className="m-0 flex flex-wrap items-baseline gap-x-2 px-3 py-2.5 text-metadata text-grey-04">
            {GRADE_RANKING_FIRST_COPY}
            {grading.onGradeYourRanking ? (
              <button
                type="button"
                className="text-text underline underline-offset-2"
                data-geo-analytics-label="grade_your_ranking"
                onClick={() => {
                  setOpen(false);
                  grading.onGradeYourRanking?.();
                }}
              >
                {GRADE_IT_LABEL}
              </button>
            ) : null}
          </p>
        ) : null}
        {GRADES.map(grade => (
          <button
            key={grade}
            type="button"
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
          disabled={!grading.ready}
          className={ITEM_CLASS}
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
      </Menu>
    </span>
  );
}
