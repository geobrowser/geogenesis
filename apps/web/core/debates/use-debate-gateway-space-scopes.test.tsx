import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retain: vi.fn(),
  release: vi.fn(),
}));

// No module mock: the hook and the gateway singleton are the pair under test, and the singleton
// opens no socket until `start()`. Spying on `retainScope` is enough to count commands.

describe('useDebateGatewaySpaceScopes', () => {
  let useDebateGatewaySpaceScopes: typeof import('./debate-gateway').useDebateGatewaySpaceScopes;

  beforeEach(async () => {
    mocks.retain.mockReset();
    mocks.release.mockReset();
    const mod = await import('./debate-gateway');
    useDebateGatewaySpaceScopes = mod.useDebateGatewaySpaceScopes;
    vi.spyOn(mod.debateGateway, 'retainScope').mockImplementation(scope => {
      mocks.retain(scope);
      return () => mocks.release(scope);
    });
  });

  const spaceIdsOf = (calls: unknown[][]) =>
    calls.map(([scope]) => (scope as { space_id: string }).space_id).sort();

  it('retains one scope per space', () => {
    renderHook(() => useDebateGatewaySpaceScopes(['a', 'b'], true));

    expect(spaceIdsOf(mocks.retain.mock.calls)).toEqual(['a', 'b']);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  // GEO-2670. The bug: keying one retain/release block on the whole joined set meant adding a
  // space released all N and re-retained all N. With `gateway_commands_by_session` at 120/minute,
  // a picker spanning a dozen spaces across a few arrival stages trips the limit on its own, and
  // the client turns `rate_limited` into a reconnect.
  it('costs one retain and no releases when a space is added', () => {
    const { rerender } = renderHook(({ ids }) => useDebateGatewaySpaceScopes(ids, true), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    mocks.retain.mockClear();

    rerender({ ids: ['a', 'b', 'c', 'd'] });

    expect(spaceIdsOf(mocks.retain.mock.calls)).toEqual(['d']);
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('releases only the space that left', () => {
    const { rerender } = renderHook(({ ids }) => useDebateGatewaySpaceScopes(ids, true), {
      initialProps: { ids: ['a', 'b', 'c'] },
    });
    mocks.retain.mockClear();

    rerender({ ids: ['a', 'c'] });

    expect(spaceIdsOf(mocks.release.mock.calls)).toEqual(['b']);
    expect(mocks.retain).not.toHaveBeenCalled();
  });

  // Reordering is not a change. The picker sorts its ids, but a caller that does not would
  // otherwise rebuild every scope for nothing.
  it('does nothing when the same spaces arrive in a different order', () => {
    const { rerender } = renderHook(({ ids }) => useDebateGatewaySpaceScopes(ids, true), {
      initialProps: { ids: ['a', 'b'] },
    });
    mocks.retain.mockClear();

    rerender({ ids: ['b', 'a'] });

    expect(mocks.retain).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it('releases everything on unmount', () => {
    const { unmount } = renderHook(() => useDebateGatewaySpaceScopes(['a', 'b'], true));

    unmount();

    expect(spaceIdsOf(mocks.release.mock.calls)).toEqual(['a', 'b']);
  });

  it('releases everything when it is disabled, and retains again when re-enabled', () => {
    const { rerender } = renderHook(({ on }) => useDebateGatewaySpaceScopes(['a', 'b'], on), {
      initialProps: { on: true },
    });

    rerender({ on: false });
    expect(spaceIdsOf(mocks.release.mock.calls)).toEqual(['a', 'b']);

    mocks.retain.mockClear();
    rerender({ on: true });
    expect(spaceIdsOf(mocks.retain.mock.calls)).toEqual(['a', 'b']);
  });
});
