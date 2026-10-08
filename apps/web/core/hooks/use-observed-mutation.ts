'use client';

import type { UseMutationResult } from '@tanstack/react-query';

import { useCallback, useRef } from 'react';

import type { ActionContext, ActionKind } from '~/core/action-context';
import { type OperationFailureCode, runObservedAction } from '~/core/analytics-operations';

/** Capture at mutate(), before React Query awaits onMutate or retries transport.
 * Preserve the mutation's variables, callbacks, result and error behavior.
 */
export function useObservedMutation<TData, TError, TVariables, TContext>(
  mutation: UseMutationResult<TData, TError, TVariables, TContext>,
  action: ActionKind,
  getContext: (variables: TVariables) => ActionContext,
  /** A failure the mutation resolves with rather than throws; see `runObservedAction`. */
  failureOf?: (data: TData) => OperationFailureCode | null
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { mutateAsync: execute } = mutation;
  const latestContext = useRef(getContext);
  latestContext.current = getContext;
  const latestFailureOf = useRef(failureOf);
  latestFailureOf.current = failureOf;
  const mutateAsync = useCallback<typeof execute>(
    (variables, options) =>
      runObservedAction(
        action,
        latestContext.current(variables),
        () => execute(variables, options),
        data => (latestFailureOf.current ? latestFailureOf.current(data) : null)
      ),
    [action, execute]
  );
  const mutate = useCallback<typeof mutation.mutate>(
    (variables, options) => {
      // Match React Query's fire-and-forget mutate contract; errors remain in state.
      void mutateAsync(variables, options).catch(() => {});
    },
    [mutateAsync]
  );
  return { ...mutation, mutate, mutateAsync };
}
