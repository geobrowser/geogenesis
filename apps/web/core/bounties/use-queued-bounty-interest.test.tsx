import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom } from '~/core/state/pending-actions';

import { useQueuedBountyInterest } from './use-queued-bounty-interest';

let store = createStore();
const queued = () => store.get(pendingActionsAtom);
const wrapper = ({ children }: { children: ReactNode }) => <JotaiProvider store={store}>{children}</JotaiProvider>;

beforeEach(() => {
  store = createStore();
});

describe('useQueuedBountyInterest', () => {
  it('queues for the personal space and draws the bounty as registered while it waits', () => {
    const { result } = renderHook(() => useQueuedBountyInterest('bounty-1', vi.fn()), { wrapper });

    act(() => result.current.queue());

    expect(queued()).toEqual([expect.objectContaining({ id: 'bounty-interest:bounty-1', requires: 'personalSpace' })]);
    expect(result.current.queued).toBe(true);
  });

  // The card on screen knows the personal space; the press's closure, taken signed out, does not.
  it('registers through the card mounted when the account is ready', async () => {
    const register = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useQueuedBountyInterest('bounty-1', register), { wrapper });

    act(() => result.current.queue());
    await queued()[0]!.run();

    expect(register).toHaveBeenCalledOnce();
  });

  // The runner drops an action whose run resolves, so a write that did not happen must throw.
  it('fails rather than reporting success when the interest was not recorded', async () => {
    const { result } = renderHook(() => useQueuedBountyInterest('bounty-1', vi.fn().mockResolvedValue(false)), {
      wrapper,
    });

    act(() => result.current.queue());

    await expect(queued()[0]!.run()).rejects.toThrow();
  });

  it('fails with no card mounted to publish it, so the runner keeps it for a retry', async () => {
    const { result, unmount } = renderHook(() => useQueuedBountyInterest('bounty-1', vi.fn()), { wrapper });

    act(() => result.current.queue());
    unmount();

    await expect(async () => queued()[0]!.run()).rejects.toThrow(/Open the bounty again/);
  });

  it('withdraws the interest on cancel', () => {
    const { result } = renderHook(() => useQueuedBountyInterest('bounty-1', vi.fn()), { wrapper });

    act(() => result.current.queue());
    act(() => result.current.cancel());

    expect(queued()).toHaveLength(0);
    expect(result.current.queued).toBe(false);
  });
});
