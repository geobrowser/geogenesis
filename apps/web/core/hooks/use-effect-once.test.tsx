import { renderHook } from '@testing-library/react';

import { StrictMode } from 'react';

import { describe, expect, it, vi } from 'vitest';

import { useEffectOnceWhen } from './use-effect-once';

describe('useEffectOnceWhen', () => {
  it('waits for ready, runs once with that render’s values, and never again for the mount', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(({ ready, value }) => useEffectOnceWhen(ready, () => effect(value)), {
      initialProps: { ready: false, value: 'loading' },
    });
    expect(effect).not.toHaveBeenCalled();

    rerender({ ready: true, value: 'loaded' });
    expect(effect).toHaveBeenCalledExactlyOnceWith('loaded');

    // A refetch that drops and restores the data is not a second time.
    rerender({ ready: false, value: 'refetching' });
    rerender({ ready: true, value: 'refetched' });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  /**
   * Strict Mode runs a mount's effects twice in development, and both runs see the render before
   * anything they set has committed — so only the ref can tell the second run it already happened.
   */
  it('runs once under the Strict Mode effect rehearsal', () => {
    const effect = vi.fn();
    renderHook(() => useEffectOnceWhen(true, effect), { wrapper: StrictMode });

    expect(effect).toHaveBeenCalledTimes(1);
  });

  // For a component reused across different subjects — a page the route moves between sessions on
  // rather than remounting — "once" is once per subject, not once per mount.
  it('runs once per key, and again for a new one', () => {
    const effect = vi.fn();
    const { rerender } = renderHook(({ key }) => useEffectOnceWhen(true, () => effect(key), key), {
      initialProps: { key: 'session-1' },
      wrapper: StrictMode,
    });
    rerender({ key: 'session-1' });
    expect(effect).toHaveBeenCalledExactlyOnceWith('session-1');

    rerender({ key: 'session-2' });
    expect(effect).toHaveBeenCalledTimes(2);
    expect(effect).toHaveBeenLastCalledWith('session-2');
  });
});
