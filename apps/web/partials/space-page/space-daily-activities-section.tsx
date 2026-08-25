'use client';

import * as React from 'react';

import cx from 'classnames';

import { useChecklistExpansion } from '~/core/hooks/use-checklist-expansion';
import { type DailyActivityTask } from '~/core/space/daily-activities';
import { DailyActivityCompletionProbes, useDailyActivityCompletion } from '~/core/space/use-daily-activity-completion';

import { ChevronDownSmall } from '~/design-system/icons/chevron-down-small';

function DailyActivityStepIndicator({ complete }: { complete: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
        complete ? 'border-purple bg-purple' : 'border-grey-03 bg-white'
      )}
    >
      {complete ? (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
          <path
            d="M1 4.2L3.6 6.8L9 1.4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
}

function DailyActivityRow({ task, complete }: { task: DailyActivityTask; complete: boolean }) {
  return (
    <li className="flex gap-3">
      <DailyActivityStepIndicator complete={complete} />
      <div className="min-w-0 flex-1">
        <p className="text-[16px] leading-[17px] font-medium tracking-[-0.35px] text-text">{task.title}</p>
        <p className="mt-1 text-[16px] leading-[16px] font-normal tracking-[-0.35px] text-grey-04">
          {task.description}
        </p>
      </div>
    </li>
  );
}

export function SpaceDailyActivitiesSection({ spaceId, tasks }: { spaceId: string; tasks: DailyActivityTask[] }) {
  const { completionById, onCompleteChange, allComplete, isLoading } = useDailyActivityCompletion(tasks);
  const { expanded, onToggle } = useChecklistExpansion({ allComplete, isLoading });

  if (tasks.length === 0) return null;

  const completedCount = tasks.reduce((count, task) => count + (completionById[task.id] ? 1 : 0), 0);
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <section className="flex flex-col rounded-lg border border-grey-02 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[24px] leading-[28px] font-semibold tracking-[-0.02em] text-text">Daily activities</h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse daily activities' : 'Expand daily activities'}
          onClick={onToggle}
          className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-grey-04 transition-colors hover:text-text"
        >
          <span className={cx('transition-transform', expanded ? 'rotate-180' : 'rotate-0')}>
            <ChevronDownSmall />
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label="Daily activities progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={isLoading ? undefined : progressPercent}
          className="h-1.5 w-full overflow-hidden rounded-full bg-grey-02"
        >
          <div
            className="h-full rounded-full bg-purple transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-[13px] leading-[13px] font-normal text-text">
          {isLoading ? 'Loading…' : `${progressPercent}% complete`}
        </p>
      </div>

      {/* Draws nothing, and deliberately outside the collapse below. These are what watch each
          task, so folding them away with the list would leave nothing to notice the daily reset —
          the checklist would stay closed, reading 100%, for the rest of the session. */}
      <DailyActivityCompletionProbes tasks={tasks} spaceId={spaceId} onCompleteChange={onCompleteChange} />

      {expanded ? (
        <ul className="mt-5 flex flex-col gap-5">
          {tasks.map(task => (
            <DailyActivityRow key={task.id} task={task} complete={completionById[task.id] ?? false} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
