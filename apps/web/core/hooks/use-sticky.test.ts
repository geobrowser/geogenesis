import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSticky } from './use-sticky';

describe('useSticky', () => {
  it('stays false until the condition holds, then stays true', () => {
    const { result, rerender } = renderHook(({ cond }) => useSticky(cond), { initialProps: { cond: false } });
    expect(result.current).toBe(false);
    rerender({ cond: true });
    expect(result.current).toBe(true);
    rerender({ cond: false });
    expect(result.current).toBe(true);
  });

  it('is true immediately when the condition already holds', () => {
    const { result } = renderHook(() => useSticky(true));
    expect(result.current).toBe(true);
  });
});
