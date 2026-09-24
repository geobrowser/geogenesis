type PublishCallbacks = { onSuccess?: () => void; onError?: () => void };

/**
 * Adapt the callback-style publisher for actions that must wait for the result.
 * Publish failures are already reported by `usePublish`, so callers only need
 * a boolean for their local success and rollback paths.
 */
export function publishOnce<TArgs extends object>(
  makeProposal: (options: TArgs & PublishCallbacks) => Promise<void>,
  args: TArgs
): Promise<boolean> {
  return new Promise(resolve => {
    void makeProposal({ ...args, onSuccess: () => resolve(true), onError: () => resolve(false) });
  });
}
