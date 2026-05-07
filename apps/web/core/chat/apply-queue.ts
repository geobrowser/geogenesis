'use client';

// Module-scoped serializer shared by `useEditDispatcher` (writes) and
// `useReadDispatcher` (reads). Both dispatchers see the same in-flight queue,
// so a read fired in the same assistant turn as preceding edits observes the
// fully-applied store rather than a snapshot from before the edits flushed.
//
// Without this, `onToolCall` can run during SDK stream processing — before
// React commits the tool-result parts that trigger the edit-dispatcher
// effect — leaving the read to see stale state.

let queue: Promise<void> = Promise.resolve();

export function enqueue(task: () => Promise<void> | void): Promise<void> {
  const next = queue.then(async () => {
    try {
      await task();
    } catch (err) {
      console.error('[chat/apply-queue] task threw', err);
    }
  });
  queue = next;
  return next;
}

// Returns a promise that resolves once all currently-queued tasks have run.
// New tasks added after this call do not block the resolution.
export function waitForFlush(): Promise<void> {
  return queue.then(() => undefined).catch(() => undefined);
}
