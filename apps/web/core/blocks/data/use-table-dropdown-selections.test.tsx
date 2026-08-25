import { act, renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import { dropdownSelectionsStorageKey } from './table-dropdown-selections';
import { useTableDropdownSelections } from './use-table-dropdown-selections';

const REL_A = 'relation-entity-a';
const REL_B = 'relation-entity-b';
const TOPICS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';

describe('useTableDropdownSelections', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('hydrates stored overrides for the block and reports hydrated', () => {
    window.localStorage.setItem(dropdownSelectionsStorageKey(REL_A), JSON.stringify({ [TOPICS]: ['t1', 't2'] }));

    const { result } = renderHook(() => useTableDropdownSelections(REL_A));

    expect(result.current.hydrated).toBe(true);
    expect(result.current.selections).toEqual({ [TOPICS]: ['t1', 't2'] });
  });

  it('never writes storage on hydration alone', () => {
    const key = dropdownSelectionsStorageKey(REL_A);
    renderHook(() => useTableDropdownSelections(REL_A));

    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('persists user changes and clears the key when no overrides remain', () => {
    const key = dropdownSelectionsStorageKey(REL_A);
    const { result } = renderHook(() => useTableDropdownSelections(REL_A));

    act(() => result.current.updateSelections(() => ({ [TOPICS]: ['t9'] })));
    expect(JSON.parse(window.localStorage.getItem(key) ?? 'null')).toEqual({ [TOPICS]: ['t9'] });

    act(() => result.current.updateSelections(() => ({})));
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it('keeps selections scoped per block relation entity', () => {
    window.localStorage.setItem(dropdownSelectionsStorageKey(REL_A), JSON.stringify({ [TOPICS]: ['a-only'] }));

    const { result, rerender } = renderHook(({ id }: { id: string }) => useTableDropdownSelections(id), {
      initialProps: { id: REL_A },
    });
    expect(result.current.selections).toEqual({ [TOPICS]: ['a-only'] });

    rerender({ id: REL_B });
    expect(result.current.selections).toEqual({});
    // Switching blocks must not carry A's overrides into B's storage.
    expect(window.localStorage.getItem(dropdownSelectionsStorageKey(REL_B))).toBeNull();
  });

  it('stays unhydrated without a block relation entity id', () => {
    const { result } = renderHook(() => useTableDropdownSelections(''));
    expect(result.current.hydrated).toBe(false);
    expect(result.current.selections).toEqual({});
  });
});
