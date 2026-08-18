import { renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useStableListOrder } from './use-stable-list-order';

type Row = { id: string };

const keyOf = (row: Row) => row.id;
const rows = (...ids: string[]): Row[] => ids.map(id => ({ id }));
const ids = (result: Row[]) => result.map(row => row.id);

describe('useStableListOrder', () => {
  it('passes the server order through on first render', () => {
    const { result } = renderHook(() => useStableListOrder(rows('a', 'b', 'c'), keyOf, 'query'));

    expect(ids(result.current)).toEqual(['a', 'b', 'c']);
  });

  // The whole point: acting on a row re-sorts the server response, and the row you just touched
  // must not jump out from under the pointer.
  it('holds the order of rows it has already shown when the server re-sorts them', () => {
    const { result, rerender } = renderHook(({ items }) => useStableListOrder(items, keyOf, 'query'), {
      initialProps: { items: rows('a', 'b', 'c') },
    });

    rerender({ items: rows('c', 'a', 'b') });

    expect(ids(result.current)).toEqual(['a', 'b', 'c']);
  });

  it('places genuinely new rows where the server put them', () => {
    const { result, rerender } = renderHook(({ items }) => useStableListOrder(items, keyOf, 'query'), {
      initialProps: { items: rows('a', 'b') },
    });

    rerender({ items: rows('new', 'a', 'b') });

    expect(ids(result.current)).toEqual(['new', 'a', 'b']);
  });

  it('drops rows the server no longer returns without disturbing the rest', () => {
    const { result, rerender } = renderHook(({ items }) => useStableListOrder(items, keyOf, 'query'), {
      initialProps: { items: rows('a', 'b', 'c') },
    });

    rerender({ items: rows('c', 'a') });

    expect(ids(result.current)).toEqual(['a', 'c']);
  });

  it('releases the hold when the query identity changes', () => {
    const { result, rerender } = renderHook(({ items, resetKey }) => useStableListOrder(items, keyOf, resetKey), {
      initialProps: { items: rows('a', 'b', 'c'), resetKey: 'query' },
    });

    rerender({ items: rows('c', 'b', 'a'), resetKey: 'different-search' });

    expect(ids(result.current)).toEqual(['c', 'b', 'a']);
  });

  it('is a fixed point, so re-rendering with the held order changes nothing', () => {
    const { result, rerender } = renderHook(({ items }) => useStableListOrder(items, keyOf, 'query'), {
      initialProps: { items: rows('a', 'b', 'c') },
    });

    rerender({ items: rows('c', 'a', 'b') });
    const held = ids(result.current);
    rerender({ items: rows('c', 'a', 'b') });

    expect(ids(result.current)).toEqual(held);
  });
});
