import { renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useStableListOrder } from '~/core/debates/matchmaking/use-stable-list-order';

type Row = { id: string };
const rows = (...ids: string[]): Row[] => ids.map(id => ({ id }));

describe('paging displacement probe', () => {
  it('shows where the supplemental row ends up as pages accumulate', () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: Row[] }) => useStableListOrder(items, r => r.id, 'k'),
      { initialProps: { items: rows('p1', 'p2', 'saved') } }
    );
    const indexOfSaved = () => result.current.findIndex(r => r.id === 'saved');
    const first = indexOfSaved();

    // Page 2 arrives. browsedRows rebuilds as [all paged rows..., extras].
    rerender({ items: rows('p1', 'p2', 'p3', 'p4', 'saved') });
    const afterPage2 = indexOfSaved();

    rerender({ items: rows('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'saved') });
    const afterPage3 = indexOfSaved();

    console.log(JSON.stringify({ first, afterPage2, afterPage3 }));
    expect([first, afterPage2, afterPage3]).toEqual([2, 4, 6]);
  });
});
