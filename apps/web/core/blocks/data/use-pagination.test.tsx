import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { MAX_JUMP_PAGES, usePagination } from './use-pagination';

describe('usePagination', () => {
  it('persists pagination state across unmount/remount for the same entity', () => {
    const entityId = 'data-block-persist-entity';
    const { result, unmount } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
      result.current.setPage('next');
      result.current.recordEndCursor(1, 'cursor-after-page-1');
      result.current.setPage('next');
    });

    expect(result.current.pageNumber).toBe(3);

    unmount();

    const { result: remounted } = renderHook(() => usePagination(entityId));
    expect(remounted.current.pageNumber).toBe(3);
    // Page 3 best anchor is at page 2 (recorded for the page-after-1 fetch).
    expect(remounted.current.currentAfter).toBe('cursor-after-page-1');
    expect(remounted.current.currentOffset).toBe(1);
  });

  it('keeps pagination state isolated by entity ID', () => {
    const firstEntityId = 'data-block-entity-one';
    const secondEntityId = 'data-block-entity-two';

    const { result: first } = renderHook(() => usePagination(firstEntityId));
    const { result: second } = renderHook(() => usePagination(secondEntityId));

    act(() => {
      first.current.setPage('next');
    });

    expect(first.current.pageNumber).toBe(1);
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

  it('uses the closest anchor + offset for the active page', () => {
    const entityId = 'data-block-offset-entity';
    const { result } = renderHook(() => usePagination(entityId));

    act(() => {
      // Walk forward one page and record its endCursor — anchor unlocks page 1.
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
      // Jump 5 pages ahead from page 1 → target page 6 = anchor(page 1) + offset 5.
      result.current.setPage(6);
    });

    expect(result.current.pageNumber).toBe(6);
    expect(result.current.currentAfter).toBe('cursor-after-page-0');
    expect(result.current.currentOffset).toBe(5);
  });

  it('exposes canJumpTo within the per-anchor cap and rejects beyond', () => {
    const entityId = 'data-block-can-jump-entity';
    const { result } = renderHook(() => usePagination(entityId));

    expect(result.current.maxJumpPages).toBe(MAX_JUMP_PAGES);
    expect(result.current.canJumpTo(MAX_JUMP_PAGES)).toBe(true);
    expect(result.current.canJumpTo(MAX_JUMP_PAGES + 1)).toBe(false);

    act(() => {
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
    });

    // After recording an anchor at page 1, we can reach page 1 + MAX_JUMP_PAGES.
    expect(result.current.canJumpTo(1 + MAX_JUMP_PAGES)).toBe(true);
    expect(result.current.canJumpTo(1 + MAX_JUMP_PAGES + 1)).toBe(false);
  });

  it('reset clears anchors and returns to page 0', () => {
    const entityId = 'data-block-reset-entity';
    const { result } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
      result.current.setPage(50);
      result.current.reset();
    });

    expect(result.current.pageNumber).toBe(0);
    expect(result.current.currentAfter).toBeUndefined();
    expect(result.current.currentOffset).toBeUndefined();
  });

  it('setPage(0) resets anchors and pageNumber together', () => {
    const entityId = 'data-block-set-zero-entity';
    const { result } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
      result.current.setPage('next');
      result.current.setPage(0);
    });

    expect(result.current.pageNumber).toBe(0);
    expect(result.current.canJumpTo(50)).toBe(true);
    expect(result.current.canJumpTo(MAX_JUMP_PAGES + 1)).toBe(false);
  });

  it('does not record duplicate anchors for the same page', () => {
    const entityId = 'data-block-dedupe-entity';
    const { result } = renderHook(() => usePagination(entityId));

    act(() => {
      result.current.setPage('next');
      result.current.recordEndCursor(0, 'cursor-after-page-0');
      // Re-record the same cursor — should be a no-op (idempotent).
      result.current.recordEndCursor(0, 'cursor-after-page-0');
    });

    expect(result.current.currentAfter).toBe('cursor-after-page-0');
  });
});
