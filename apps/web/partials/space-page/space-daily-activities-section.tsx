'use client';

import * as React from 'react';

import cx from 'classnames';

import { DAILY_ACTIVITIES_PROGRESS_COLOR, type DailyActivityTask } from '~/core/space/daily-activities';
import {
  useDailyUploadActivityComplete,
  useRankingDailyActivityComplete,
  useSpaceDailyActivityTasks,
} from '~/core/space/use-space-daily-activities';

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

function RankingActivityRow({
  task,
  spaceId,
  onCompleteChange,
}: {
  task: Extract<DailyActivityTask, { kind: 'ranking' }>;
  spaceId: string;
  onCompleteChange: (id: string, complete: boolean) => void;
}) {
  const { complete, isLoading } = useRankingDailyActivityComplete(task.blockId, spaceId);

  React.useEffect(() => {
    if (!isLoading) onCompleteChange(task.id, complete);
  }, [complete, isLoading, onCompleteChange, task.id]);

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

function UploadActivityRow({
  task,
  spaceId,
  onCompleteChange,
}: {
  task: Extract<DailyActivityTask, { kind: 'upload' }>;
  spaceId: string;
  onCompleteChange: (id: string, complete: boolean) => void;
}) {
  const complete = useDailyUploadActivityComplete(spaceId);

  React.useEffect(() => {
    onCompleteChange(task.id, complete);
  }, [complete, onCompleteChange, task.id]);

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

export function SpaceDailyActivitiesSection({ spaceId }: { spaceId: string }) {
  const { tasks } = useSpaceDailyActivityTasks(spaceId);
  const [expanded, setExpanded] = React.useState(true);
  const [completionById, setCompletionById] = React.useState<Record<string, boolean>>({});

  const onCompleteChange = React.useCallback((id: string, complete: boolean) => {
    setCompletionById(prev => (prev[id] === complete ? prev : { ...prev, [id]: complete }));
  }, []);

  // Drop stale completion keys when the task list changes (e.g. block removed).
  React.useEffect(() => {
    const ids = new Set(tasks.map(t => t.id));
    setCompletionById(prev => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [id, value] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  if (tasks.length === 0) return null;

  const completedCount = tasks.reduce((count, task) => count + (completionById[task.id] ? 1 : 0), 0);
  const progressPercent = Math.round((completedCount / tasks.length) * 100);
  const isLoading = tasks.some(task => completionById[task.id] === undefined);

  return (
    <section className="flex flex-col rounded-lg border border-grey-02 bg-white p-5 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[24px] leading-[28px] font-semibold tracking-[-0.02em] text-text">Daily activities</h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse daily activities' : 'Expand daily activities'}
          onClick={() => setExpanded(prev => !prev)}
          className="mt-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-grey-04 transition-colors hover:text-text"
        >
          <span className={cx('transition-transform', expanded ? 'rotate-180' : 'rotate-0')}>
            <ChevronDownSmall />
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-grey-02">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: DAILY_ACTIVITIES_PROGRESS_COLOR,
            }}
          />
        </div>
        <p className="text-[13px] leading-[13px] font-normal text-text">
          {isLoading ? 'Loading…' : `${progressPercent}% complete`}
        </p>
      </div>

      {expanded ? (
        <ul className="mt-5 flex flex-col gap-5">
          {tasks.map(task =>
            task.kind === 'ranking' ? (
              <RankingActivityRow key={task.id} task={task} spaceId={spaceId} onCompleteChange={onCompleteChange} />
            ) : (
              <UploadActivityRow key={task.id} task={task} spaceId={spaceId} onCompleteChange={onCompleteChange} />
            )
          )}
        </ul>
      ) : null}
    </section>
  );
}
