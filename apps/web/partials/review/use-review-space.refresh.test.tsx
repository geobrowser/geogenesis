import { act, cleanup, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it } from 'vitest';

import { DiffProvider, useDiff } from '~/core/state/diff-store';

import { useReviewSpace } from './use-review-space';

afterEach(cleanup);

function wrapper({ children }: { children: React.ReactNode }) {
  return <DiffProvider>{children}</DiffProvider>;
}

function useReview() {
  const diff = useDiff();
  const options = {
    ...diff,
    spaceIds: ['route', 'manual'],
    currentSpaceId: 'route',
    preferredSpaceId: diff.activeSpace,
    preferredSpaceVersion: diff.reviewTargetVersion,
  };
  return { diff, selection: useReviewSpace(options) };
}

describe('review refresh and explicit requests', () => {
  it.each([false, true])('keeps a manual selection after a side-panel diff refresh (explicit target: %s)', explicit => {
    const { result } = renderHook(useReview, { wrapper });
    act(() => {
      if (explicit) result.current.diff.setActiveSpace('route');
      result.current.diff.setIsReviewOpen(true);
    });
    act(() => result.current.selection.setActiveSpace('manual'));
    act(() => result.current.diff.bumpReviewVersion());
    expect(result.current.selection.activeSpace).toBe('manual');
  });

  it('honors a repeated explicit request for the same space while already open', () => {
    const { result } = renderHook(useReview, { wrapper });
    act(() => {
      result.current.diff.setActiveSpace('route');
      result.current.diff.setIsReviewOpen(true);
    });
    act(() => result.current.selection.setActiveSpace('manual'));
    act(() => {
      result.current.diff.setActiveSpace('route');
      result.current.diff.bumpReviewVersion();
    });
    expect(result.current.selection.activeSpace).toBe('route');
  });
});
