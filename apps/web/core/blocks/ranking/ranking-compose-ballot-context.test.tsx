import { act, renderHook } from '@testing-library/react';

import { describe, expect, it, vi } from 'vitest';

import { useComposeBallot } from './ranking-compose-ballot-context';

describe('useComposeBallot', () => {
  it('publishes through the newest publish function, though the draft didn’t change', async () => {
    // Stands in for the screen's publish before and after its first ballot exists: the second
    // one revises rank1, the first would mint a new rank.
    const mintsNewRank = vi.fn(async (_ids: string[]) => true);
    const revisesRank1 = vi.fn(async (_ids: string[]) => true);
    const setOrderedIds = vi.fn();
    const draft = ['a', 'b'];

    const { result, rerender } = renderHook(
      ({ publish }: { publish: (ids: string[]) => Promise<boolean> }) =>
        useComposeBallot({ orderedIds: draft, setOrderedIds, publish }),
      { initialProps: { publish: mintsNewRank } }
    );
    const first = result.current;

    rerender({ publish: revisesRank1 });
    expect(result.current).toBe(first);

    await act(async () => {
      await result.current!.publish(['a']);
    });

    expect(revisesRank1).toHaveBeenCalledWith(['a']);
    expect(mintsNewRank).not.toHaveBeenCalled();
    expect(setOrderedIds).toHaveBeenCalledWith(['a']);
  });

  it('is off without a source', () => {
    const { result } = renderHook(() => useComposeBallot(null));
    expect(result.current).toBeNull();
  });
});
