import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { useAtom, useAtomValue } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { statusBarDispatchAtom, statusBarStateAtom } from '~/core/state/status-bar-store';

import { PendingPersonalSpaceRunner } from './pending-personal-space-runner';

const ADDRESS = '0xFC780000000000000000000000000000000C171';

const mocks = vi.hoisted(() => ({
  createPersonalSpace: vi.fn(),
  readRegisteredSpaceId: vi.fn(),
}));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: ADDRESS } }, isLoading: false }),
}));
vi.mock('~/core/hooks/use-create-personal-space', () => ({
  useCreatePersonalSpace: () => ({ createPersonalSpace: mocks.createPersonalSpace }),
}));
vi.mock('~/core/hooks/use-smart-account-transaction', () => ({ useSmartAccountTransaction: () => vi.fn() }));
vi.mock('~/core/sync/use-sync-engine', () => ({ useSyncEngine: () => ({ store: { remapSpaceId: vi.fn() } }) }));
vi.mock('~/core/utils/contracts/create-personal-space-on-chain', () => ({
  readRegisteredSpaceId: mocks.readRegisteredSpaceId,
}));
vi.mock('~/core/auth-attempt', () => ({ trackAuthOnboarding: vi.fn() }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  mocks.createPersonalSpace.mockReset();
  mocks.readRegisteredSpaceId.mockReset();
});

/** The runner, plus the persisted job and the status bar it reports into. */
function setup(initial: { status: 'pending' | 'failed' }) {
  const hook = renderHook(() => {
    PendingPersonalSpaceRunner();
    const [pending, setPending] = useAtom(pendingPersonalSpaceAtom);
    return { pending, setPending, statusBar: useAtomValue(statusBarStateAtom) };
  });
  act(() => {
    hook.result.current.setPending({ topicId: 'topic-1', address: ADDRESS, status: initial.status });
  });
  return hook;
}

function clearStatusBar(hook: ReturnType<typeof setup>) {
  const dispatch = renderHook(() => useAtom(statusBarDispatchAtom)[1]).result.current;
  act(() => dispatch({ type: 'ERROR', payload: null }));
  hook.rerender();
}

describe('PendingPersonalSpaceRunner', () => {
  // 2026-10-15, a real account: setup failed, he reloaded, and the account had no onboarding dialog
  // (gated off by the pending record), no retry (the status bar is in-memory) and no space.
  it('offers the retry again for a failure persisted by an earlier load', async () => {
    const { result } = setup({ status: 'failed' });

    await waitFor(() => expect(result.current.statusBar.error).toBe("Account setup didn't finish."));
    expect(result.current.statusBar.retry).toBeTypeOf('function');
    expect(mocks.createPersonalSpace).not.toHaveBeenCalled();

    mocks.createPersonalSpace.mockReturnValue(new Promise(() => {}));
    act(() => result.current.statusBar.retry?.());

    expect(result.current.pending?.status).toBe('pending');
    await waitFor(() => expect(mocks.createPersonalSpace).toHaveBeenCalledTimes(1));
  });

  it('offers it once per load, not on every re-render', async () => {
    const hook = setup({ status: 'failed' });
    await waitFor(() => expect(hook.result.current.statusBar.error).not.toBeNull());

    clearStatusBar(hook);
    hook.rerender();

    expect(hook.result.current.statusBar.error).toBeNull();
  });

  it('keeps the real error for a failure in this load', async () => {
    mocks.createPersonalSpace.mockRejectedValue(new Error('bundler down'));
    mocks.readRegisteredSpaceId.mockResolvedValue(null);

    const { result } = setup({ status: 'pending' });

    await waitFor(() => expect(result.current.pending?.status).toBe('failed'));
    await waitFor(() => expect(result.current.statusBar.error).toMatch(/^Account setup failed: /));
    expect(result.current.statusBar.error).toContain('bundler down');
  });
});
