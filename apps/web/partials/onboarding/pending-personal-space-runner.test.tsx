import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import { useAtom, useAtomValue } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { statusBarDispatchAtom, statusBarStateAtom } from '~/core/state/status-bar-store';
import { ProfileRecoveryError, ProfileStillProcessingError } from '~/core/utils/contracts/personal-profile-recovery';

import { PendingPersonalSpaceRunner } from './pending-personal-space-runner';

const ADDRESS = '0xFC780000000000000000000000000000000C171';

const mocks = vi.hoisted(() => ({
  createPersonalSpace: vi.fn(),
  readRegisteredSpaceId: vi.fn(),
  trackAuthOnboarding: vi.fn(),
  setQueryData: vi.fn(),
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
vi.mock('~/core/auth-attempt', () => ({ trackAuthOnboarding: mocks.trackAuthOnboarding }));
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ setQueryData: mocks.setQueryData, invalidateQueries: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  mocks.createPersonalSpace.mockReset();
  mocks.readRegisteredSpaceId.mockReset();
  mocks.trackAuthOnboarding.mockReset();
  mocks.setQueryData.mockReset();
});

/** The runner, plus the persisted job and the status bar it reports into. */
function setup(initial: { status: 'pending' | 'failed'; address?: string }) {
  const hook = renderHook(() => {
    PendingPersonalSpaceRunner();
    const [pending, setPending] = useAtom(pendingPersonalSpaceAtom);
    return { pending, setPending, statusBar: useAtomValue(statusBarStateAtom) };
  });
  act(() => {
    hook.result.current.setPending({ topicId: 'topic-1', address: initial.address ?? ADDRESS, status: initial.status });
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

  it('keeps a job stamped with the same address in another case', async () => {
    const { result } = setup({ status: 'failed', address: ADDRESS.toLowerCase() });

    await waitFor(() => expect(result.current.statusBar.error).toBe("Account setup didn't finish."));
    expect(result.current.pending).not.toBeNull();
  });

  it('keeps the real error for a failure in this load', async () => {
    mocks.createPersonalSpace.mockRejectedValue(new Error('bundler down'));
    mocks.readRegisteredSpaceId.mockResolvedValue(null);

    const { result } = setup({ status: 'pending' });

    await waitFor(() => expect(result.current.pending?.status).toBe('failed'));
    await waitFor(() => expect(result.current.statusBar.error).toMatch(/^Account setup failed: /));
    expect(result.current.statusBar.error).toContain('bundler down');
  });

  // GEO-3803: a retry for a profile the chain shows but the index doesn't is not a failure.
  it('says the profile is still being saved, and seeds the declared person entity', async () => {
    mocks.createPersonalSpace.mockRejectedValue(new ProfileStillProcessingError(Date.now(), 'declared-topic'));
    mocks.readRegisteredSpaceId.mockResolvedValue('space-1');

    const { result } = setup({ status: 'pending' });

    await waitFor(() => expect(result.current.statusBar.error).toBe(new ProfileStillProcessingError(0, '').message));
    expect(result.current.statusBar.retry).toBeTypeOf('function');
    expect(result.current.pending).toBeNull();
    expect(mocks.setQueryData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ personalSpaceId: 'space-1', personalEntityId: 'declared-topic' })
    );
    expect(mocks.trackAuthOnboarding).not.toHaveBeenCalledWith('personal_space', 'failed');
  });

  it('says clearly when a dropped profile cannot be restored yet', async () => {
    mocks.createPersonalSpace.mockRejectedValue(
      new ProfileRecoveryError('The original profile edit could not be fetched.')
    );
    mocks.readRegisteredSpaceId.mockResolvedValue('space-1');

    const { result } = setup({ status: 'pending' });

    await waitFor(() =>
      expect(result.current.statusBar.error).toBe("We couldn't restore your profile yet. Try again in a few minutes.")
    );
    expect(result.current.statusBar.retry).toBeTypeOf('function');
  });

  it('seeds the person entity a recovered profile was published under, not this job topic', async () => {
    mocks.createPersonalSpace.mockImplementation(
      async ({ onRegistered }: { onRegistered: (spaceId: string, entityId?: string) => void }) => {
        onRegistered('space-1', 'declared-topic');
        return 'space-1';
      }
    );

    const { result } = setup({ status: 'pending' });

    await waitFor(() => expect(result.current.pending).toBeNull());
    expect(mocks.setQueryData).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ personalSpaceId: 'space-1', personalEntityId: 'declared-topic' })
    );
  });
});
