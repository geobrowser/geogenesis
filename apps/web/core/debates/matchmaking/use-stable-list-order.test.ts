import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useNewArrivalsFirst, useStableListOrder } from './use-stable-list-order';

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

describe('useNewArrivalsFirst (GEO-3505)', () => {
  type Props = { items: Row[]; settled: boolean; hold: boolean; resetKey: string };
  const render = (initial: Partial<Props> = {}) =>
    renderHook(
      ({ items, settled, hold, resetKey }: Props) => useNewArrivalsFirst(items, keyOf, { resetKey, settled, hold }),
      { initialProps: { items: rows('a', 'b'), settled: true, hold: false, resetKey: 's', ...initial } }
    );

  it('leaves what was there when the list settled where it is, untagged', () => {
    const { result } = render();
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.newKeys.size).toBe(0);
  });

  it('counts nothing as new before the list settles', () => {
    const { result, rerender } = render({ items: [], settled: false });
    rerender({ items: rows('a'), settled: false, hold: false, resetKey: 's' });
    rerender({ items: rows('a', 'b'), settled: true, hold: false, resetKey: 's' });
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.newKeys.size).toBe(0);
  });

  it('lifts a later row to the top and tags it, newest first', () => {
    const { result, rerender } = render();
    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: false, resetKey: 's' });
    rerender({ items: rows('a', 'd', 'b', 'c'), settled: true, hold: false, resetKey: 's' });
    expect(ids(result.current.items)).toEqual(['d', 'c', 'a', 'b']);
    expect([...result.current.newKeys]).toEqual(['d', 'c']);
  });

  it('keeps an arrival off the list while held, then lands it at the top', () => {
    const { result, rerender } = render();
    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: true, resetKey: 's' });
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect(result.current.waitingCount).toBe(1);

    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: false, resetKey: 's' });
    expect(ids(result.current.items)).toEqual(['c', 'a', 'b']);
    expect(result.current.waitingCount).toBe(0);
  });

  it('clears the tag once dismissed without moving the row', () => {
    const { result, rerender } = render();
    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: false, resetKey: 's' });
    act(() => result.current.dismiss('c'));
    expect(result.current.newKeys.size).toBe(0);
    expect(ids(result.current.items)).toEqual(['c', 'a', 'b']);
  });

  it('treats a row that left and came back as new again', () => {
    const { result, rerender } = render();
    rerender({ items: rows('b'), settled: true, hold: false, resetKey: 's' });
    rerender({ items: rows('a', 'b'), settled: true, hold: false, resetKey: 's' });
    expect(ids(result.current.items)).toEqual(['a', 'b']);
    expect([...result.current.newKeys]).toEqual(['a']);
  });

  it('starts over on a reset', () => {
    const { result, rerender } = render();
    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: false, resetKey: 's' });
    rerender({ items: rows('a', 'b', 'c'), settled: true, hold: false, resetKey: 'other' });
    expect(ids(result.current.items)).toEqual(['a', 'b', 'c']);
    expect(result.current.newKeys.size).toBe(0);
  });
});
