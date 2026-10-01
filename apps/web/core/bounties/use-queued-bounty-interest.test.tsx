import { act, cleanup, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { Provider as JotaiProvider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingActionsAtom } from '~/core/state/pending-actions';

import { useQueuedBountyInterest } from './use-queued-bounty-interest';

let store = createStore();
const queued = () => store.get(pendingActionsAtom);
const wrapper = ({ children }: { children: ReactNode }) => <JotaiProvider store={store}>{children}</JotaiProvider>;

function renderInterest(register: () => Promise<boolean>, alreadyInterested = false) {
  return renderHook(() => useQueuedBountyInterest('bounty-1', { alreadyInterested, register }), { wrapper });
}

afterEach(cleanup);

beforeEach(() => {
  store = createStore();
});

describe('useQueuedBountyInterest', () => {
  it('queues for the personal space and draws the bounty as registered while it waits', () => {
    const { result } = renderInterest(vi.fn());

    act(() => result.current.queue());

    expect(queued()).toEqual([expect.objectContaining({ id: 'bounty-interest:bounty-1', requires: 'personalSpace' })]);
    expect(result.current.queued).toBe(true);
  });

  // The card on screen knows the personal space; the press's closure, taken signed out, does not.
  it('registers through the card mounted when the account is ready', async () => {
    const register = vi.fn().mockResolvedValue(true);
    const { result } = renderInterest(register);

    act(() => result.current.queue());
    await queued()[0]!.run();

    expect(register).toHaveBeenCalledOnce();
  });

  // A returning viewer who already applied signed in to press it again: nothing new to publish.
  it('publishes nothing for a viewer who is already interested', async () => {
    const register = vi.fn().mockResolvedValue(true);
    const { result } = renderInterest(register, true);

    act(() => result.current.queue());
    await queued()[0]!.run();

    expect(register).not.toHaveBeenCalled();
  });

  // The runner drops an action whose run resolves, so a write that did not happen must throw.
  it('fails rather than reporting success when the interest was not recorded', async () => {
    const { result } = renderInterest(vi.fn().mockResolvedValue(false));

    act(() => result.current.queue());

    await expect(queued()[0]!.run()).rejects.toThrow();
  });

  // With no card on screen when the account is ready, it waits for one rather than failing.
  it('waits for a card to mount, then registers through it', async () => {
    const first = renderInterest(vi.fn());
    act(() => first.result.current.queue());
    first.unmount();

    let settled = false;
    const running = Promise.resolve(queued()[0]!.run()).then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    const register = vi.fn().mockResolvedValue(true);
    renderInterest(register);
    await running;

    expect(register).toHaveBeenCalledOnce();
  });

  it('withdraws the interest on cancel', () => {
    const { result } = renderInterest(vi.fn());

    act(() => result.current.queue());
    act(() => result.current.cancel());

    expect(queued()).toHaveLength(0);
    expect(result.current.queued).toBe(false);
  });
});
