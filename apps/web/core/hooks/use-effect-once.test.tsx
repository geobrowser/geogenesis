import { renderHook } from '@testing-library/react';

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
});
