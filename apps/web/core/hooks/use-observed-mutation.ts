'use client';

import type { UseMutationResult } from '@tanstack/react-query';

import { useCallback } from 'react';

import type { ActionContext, ActionKind } from '~/core/action-context';
import { runObservedAction } from '~/core/analytics-operations';

/** Capture at mutate(), before React Query awaits onMutate or retries transport.
 * Preserve the mutation's variables, callbacks, result and error behavior.
 */
export function useObservedMutation<TData, TError, TVariables, TContext>(
  mutation: UseMutationResult<TData, TError, TVariables, TContext>,
  action: ActionKind,
  getContext: (variables: TVariables) => ActionContext
): UseMutationResult<TData, TError, TVariables, TContext> {
  const { mutateAsync: execute } = mutation;
  const mutateAsync = useCallback<typeof execute>(
    (variables, options) => runObservedAction(action, getContext(variables), () => execute(variables, options)),
    [action, execute, getContext]
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
