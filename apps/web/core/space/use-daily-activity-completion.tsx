'use client';

import { hashKey, useQueryClient } from '@tanstack/react-query';

import * as React from 'react';

import { type DailyActivityTask } from '~/core/space/daily-activities';
import {
  useDailyUploadActivityComplete,
  useRankingDailyActivityComplete,
} from '~/core/space/use-space-daily-activities';

type CompletionById = Record<string, boolean>;

const EMPTY_COMPLETION: CompletionById = {};

/**
 * Shared because two parts of the page have to agree on it: the overview side panel decides
 * whether to draw the checklist, and the space header sizes itself on whether a sidebar is there
 * at all. Read from separate state they could disagree, and the header would keep its narrower
 * with-sidebar width against a page that no longer has one.
 */
function completionQueryKey(spaceId: string) {
  return ['space-daily-activity-completion', spaceId] as const;
}

/**
 * Completion for a space's daily activities, held outside the checklist that displays it.
 *
 * Each task owns its own answer — a ranking's query is keyed on its block, and the upload task
 * watches a storage write and local midnight — so knowing a task is done means having something
 * mounted watching it. Keeping that inside the checklist would make "hide it once it's done"
 * self-defeating: hiding would unmount the watchers, and nothing would be left to notice the daily
 * reset. {@link DailyActivityCompletionProbes} mounts them alongside, and writes here.
 */
export function useDailyActivityCompletion(
  spaceId: string,
  tasks: DailyActivityTask[]
): {
  completionById: CompletionById;
  onCompleteChange: (id: string, complete: boolean) => void;
  /** Every task reported done. False while any is still unknown, so loading never reads as done. */
  allComplete: boolean;
  isLoading: boolean;
} {
  const queryClient = useQueryClient();
  const queryKey = React.useMemo(() => completionQueryKey(spaceId), [spaceId]);
  const queryHash = React.useMemo(() => hashKey(queryKey), [queryKey]);

  const getSnapshot = React.useCallback(
    () => queryClient.getQueryData<CompletionById>(queryKey) ?? EMPTY_COMPLETION,
    [queryClient, queryKey]
  );
  const subscribe = React.useCallback(
    (onStoreChange: () => void) =>
      queryClient.getQueryCache().subscribe(event => {
        if (event.query.queryHash === queryHash) onStoreChange();
      }),
    [queryClient, queryHash]
  );
  const completionById = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const onCompleteChange = React.useCallback(
    (id: string, complete: boolean) => {
      queryClient.setQueryData<CompletionById>(queryKey, (prev = EMPTY_COMPLETION) =>
        prev[id] === complete ? prev : { ...prev, [id]: complete }
      );
    },
    [queryClient, queryKey]
  );

  // Drop stale keys when the task list changes (e.g. block removed), so a task that no longer
  // exists can't hold the checklist open — or, worse, keep reporting it complete.
  React.useEffect(() => {
    const ids = new Set(tasks.map(task => task.id));
    queryClient.setQueryData<CompletionById>(queryKey, (prev = EMPTY_COMPLETION) => {
      const next: CompletionById = {};
      let changed = false;
      for (const [id, value] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [queryClient, queryKey, tasks]);

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
