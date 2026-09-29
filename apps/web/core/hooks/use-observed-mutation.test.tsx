import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, expect, it, vi } from 'vitest';

import { enterActionContext, snapshotActionContext } from '~/core/action-context';
import { useActionContext } from '~/core/action-context-provider';

import { useObservedMutation } from './use-observed-mutation';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => 0 }));
afterEach(() => {
  cleanup();
  capture.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

it('captures before asynchronous onMutate, counts retries once and preserves callback variables', async () => {
  const execute = vi.fn().mockRejectedValueOnce(new Error('retry')).mockResolvedValue('created');
  const onSuccess = vi.fn();
  const { result } = renderHook(
    () => {
      const getContext = useActionContext('debate_matchmaking', 'claim', 'claim');
      const mutation = useMutation({
        mutationFn: execute,
        retry: 1,
        retryDelay: 0,
        onMutate: async () => {
          await Promise.resolve();
          window.history.replaceState({}, '', '/elsewhere');
          return { original: true };
        },
      });
      return useObservedMutation(mutation, 'start_debate', () => getContext());
    },
    { wrapper }
  );
  window.history.replaceState({}, '', '/explore');
  enterActionContext(
    snapshotActionContext('debate_claim_ticker', 'claim', 'claim', {
      playback_instance_id: 'playback',
      item_position: 10,
    })
  );
  await act(async () => {
    expect(await result.current.mutateAsync('input', { onSuccess })).toBe('created');
  });
  expect(execute).toHaveBeenCalledTimes(2);
  expect(onSuccess.mock.calls[0].slice(0, 3)).toEqual(['created', 'input', { original: true }]);
  expect(result.current.variables).toBe('input');
  expect(capture).toHaveBeenCalledExactlyOnceWith(
    'action_completed',
    expect.objectContaining({
      page_path: '/explore',
      component: 'debate_claim_ticker',
      item_position: 10,
      playback_instance_id: 'playback',
      outcome: 'succeeded',
    })
  );
});

it('preserves mutateAsync rejection and the mutation error state', async () => {
  const failure = { code: 4001 };
  const { result } = renderHook(
    () => {
      const getContext = useActionContext('join_space_button', 'space', 'space');
      const mutation = useMutation({
        mutationFn: async () => {
          throw failure;
        },
      });
      return useObservedMutation(mutation, 'join_space', () => getContext());
    },
    { wrapper }
  );
  await act(async () => {
    await expect(result.current.mutateAsync()).rejects.toBe(failure);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(result.current.error).toBe(failure);
  expect(capture).toHaveBeenCalledExactlyOnceWith(
    'action_completed',
    expect.objectContaining({
      outcome: 'failed',
      failure_code: 'rejected',
    })
  );
});
