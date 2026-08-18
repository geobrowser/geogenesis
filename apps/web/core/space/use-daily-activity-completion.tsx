'use client';

import * as React from 'react';

import { type DailyActivityTask } from '~/core/space/daily-activities';
import {
  useDailyUploadActivityComplete,
  useRankingDailyActivityComplete,
} from '~/core/space/use-space-daily-activities';

/**
 * Deliberately partial: an absent key is a task nobody has answered yet, and that is the whole
 * basis of `isLoading` below. `Record<string, boolean>` would claim every task already has an
 * answer, which is exactly the distinction this needs to keep.
 */
export type DailyActivityCompletionById = Partial<Record<string, boolean>>;

/**
 * Completion for a space's daily activities, held outside the list that displays it.
 *
 * Each task owns its own answer — a ranking's query is keyed on its block, and the upload task
 * watches a storage write and local midnight — so knowing a task is done means having something
 * mounted watching it. Keeping that inside the collapsible list would make a checklist that folds
 * itself away on completion self-defeating: collapsing unmounts the watchers, and nothing would be
 * left to notice the reset that makes it worth opening again.
 *
 * So {@link DailyActivityCompletionProbes} mounts them beside the list rather than within it, and
 * reports here.
 */
export function useDailyActivityCompletion(tasks: DailyActivityTask[]): {
  completionById: DailyActivityCompletionById;
  onCompleteChange: (id: string, complete: boolean) => void;
  /** Every task reported done. False while any is still unknown, so loading never reads as done. */
  allComplete: boolean;
  isLoading: boolean;
} {
  const [completionById, setCompletionById] = React.useState<DailyActivityCompletionById>({});

  const onCompleteChange = React.useCallback((id: string, complete: boolean) => {
    setCompletionById(prev => (prev[id] === complete ? prev : { ...prev, [id]: complete }));
  }, []);

  // Drop stale keys when the task list changes (e.g. block removed), so a task that no longer
  // exists can't hold the list open — or, worse, keep reporting it complete.
  React.useEffect(() => {
    const ids = new Set(tasks.map(task => task.id));
    setCompletionById(prev => {
      const next: DailyActivityCompletionById = {};
      let changed = false;
      for (const [id, value] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const isLoading = tasks.some(task => completionById[task.id] === undefined);
  const allComplete = tasks.length > 0 && tasks.every(task => completionById[task.id] === true);

  return { completionById, onCompleteChange, allComplete, isLoading };
}

function RankingActivityProbe({
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

  return null;
}

function UploadActivityProbe({
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

  return null;
}

/** Watches every task's completion and draws nothing. See {@link useDailyActivityCompletion}. */
export function DailyActivityCompletionProbes({
  tasks,
  spaceId,
  onCompleteChange,
}: {
  tasks: DailyActivityTask[];
  spaceId: string;
  onCompleteChange: (id: string, complete: boolean) => void;
}) {
  return (
    <>
      {tasks.map(task =>
        task.kind === 'ranking' ? (
          <RankingActivityProbe key={task.id} task={task} spaceId={spaceId} onCompleteChange={onCompleteChange} />
        ) : (
          <UploadActivityProbe key={task.id} task={task} spaceId={spaceId} onCompleteChange={onCompleteChange} />
        )
      )}
    </>
  );
}
