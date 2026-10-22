import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useReviewSpace } from './use-review-space';

const base = {
  spaceIds: ['personal', 'public'],
  isReviewOpen: true,
  preferredSpaceVersion: 1,
  preferredSpaceId: '',
  currentSpaceId: undefined as string | undefined,
};

describe('useReviewSpace', () => {
  it('opens the current space when it has edits, even if personal edits came first', () => {
    const { result } = renderHook(() => useReviewSpace({ ...base, currentSpaceId: 'public' }));
    expect(result.current.activeSpace).toBe('public');
  });

  it('falls back to a space with edits when the current personal space is empty', () => {
    const { result } = renderHook(() => useReviewSpace({ ...base, spaceIds: ['public'], currentSpaceId: 'personal' }));
    expect(result.current.activeSpace).toBe('public');
  });

  it('honors an explicit review target over the current route', () => {
    const { result } = renderHook(() =>
      useReviewSpace({ ...base, preferredSpaceId: 'personal', currentSpaceId: 'public' })
    );
    expect(result.current.activeSpace).toBe('personal');
  });

  it('ignores an explicit target without edits', () => {
    const { result } = renderHook(() =>
      useReviewSpace({ ...base, preferredSpaceId: 'empty', currentSpaceId: 'public' })
    );
    expect(result.current.activeSpace).toBe('public');
  });

  it('preserves a manual selection as edits and the route change', () => {
    const { result, rerender } = renderHook(useReviewSpace, {
      initialProps: { ...base, preferredSpaceId: 'public', currentSpaceId: 'public' },
    });
    act(() => result.current.setActiveSpace('personal'));
    rerender({
      ...base,
      spaceIds: ['personal', 'public', 'third'],
      preferredSpaceId: 'public',
      currentSpaceId: 'third',
    });
    expect(result.current.activeSpace).toBe('personal');
  });

  it('reselects the current space on reopen even without a version bump (keyboard shortcut)', () => {
    const { result, rerender } = renderHook(useReviewSpace, { initialProps: base });
    expect(result.current.activeSpace).toBe('personal');
    rerender({ ...base, isReviewOpen: false });
    rerender({ ...base, currentSpaceId: 'public' });
    expect(result.current.activeSpace).toBe('public');
  });

  it('moves to a remaining space when the active space is published or discarded', () => {
    const { result, rerender } = renderHook(useReviewSpace, { initialProps: base });
    rerender({ ...base, spaceIds: ['public'] });
    expect(result.current.activeSpace).toBe('public');
  });

  it('keeps the last space for publish completion and handles an import clear/rebuild gap', () => {
    const { result, rerender } = renderHook(useReviewSpace, { initialProps: base });
    rerender({ ...base, spaceIds: [] });
    expect(result.current.activeSpace).toBe('personal');
    rerender({ ...base, spaceIds: ['public'] });
    expect(result.current.activeSpace).toBe('public');
  });

  it('waits for edits before selecting the initial space', () => {
    const { result, rerender } = renderHook(useReviewSpace, {
      initialProps: { ...base, spaceIds: [] as string[], currentSpaceId: 'public' },
    });
    rerender({ ...base, currentSpaceId: 'public' });
    expect(result.current.activeSpace).toBe('public');
  });

  it('applies a preferred target once its staged edits arrive', () => {
    const { result, rerender } = renderHook(useReviewSpace, {
      initialProps: { ...base, spaceIds: ['public'], preferredSpaceId: 'personal' },
    });
    expect(result.current.activeSpace).toBe('public');
    rerender({ ...base, preferredSpaceId: 'personal' });
    expect(result.current.activeSpace).toBe('personal');
  });

  it('honors a new explicit request while already open', () => {
    const { result, rerender } = renderHook(useReviewSpace, {
      initialProps: { ...base, preferredSpaceId: 'personal' },
    });
    rerender({ ...base, preferredSpaceVersion: 2, preferredSpaceId: 'public' });
    expect(result.current.activeSpace).toBe('public');
  });
});
