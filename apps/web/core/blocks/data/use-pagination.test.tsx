import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePagination } from './use-pagination';

describe('usePagination', () => {
  it('persists pagination state across unmount/remount for the same entity', () => {
    const entityId = 'data-block-persist-entity';
    const { result, unmount } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('next');
      result.current.setPage('next');
    });

    expect(result.current.pageNumber).toBe(2);

    unmount();

    const { result: remounted } = renderHook(() => usePagination(entityId));
    expect(remounted.current.pageNumber).toBe(2);
  });

  it('keeps pagination state isolated by entity ID', () => {
    const firstEntityId = 'data-block-entity-one';
    const secondEntityId = 'data-block-entity-two';

    const { result: first } = renderHook(() => usePagination(firstEntityId));
    const { result: second } = renderHook(() => usePagination(secondEntityId));

    act(() => {
      first.current.setPage(3);
    });

    expect(first.current.pageNumber).toBe(3);
    expect(second.current.pageNumber).toBe(0);
  });

  it('never decrements below page zero', () => {
    const entityId = 'data-block-clamp-entity';
    const { result } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('previous');
      result.current.setPage('previous');
    });

    expect(result.current.pageNumber).toBe(0);
  });
});
