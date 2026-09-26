import '@testing-library/jest-dom/vitest';
import { act, renderHook } from '@testing-library/react';

import { describe, expect, it } from 'vitest';

import { useInlineComposer } from './inline-comment-composer';

/**
 * Whether a row should be holding its branch open for something the reader wrote.
 *
 * The rows gate real work on this: `DebateActivityRow` draws its spine and both collapse controls on
 * it, `ExtractedClaimRow` mounts its replies on it, and `DebateBranch` lifts the gate on its comments
 * query with it — because a comment written a second ago is a branch the server aggregate has not
 * heard about yet.
 *
 * As a latching flag that meant a *rejected* publish left all three enabled for a comment that had
 * been taken back out: a collapse control that collapsed nothing, and a fetch looking for a row that
 * no longer existed.
 */
describe('useInlineComposer', () => {
  it('holds nothing open until something is posted', () => {
    const { result } = renderHook(() => useInlineComposer());

    expect(result.current.hasPosted).toBe(false);
  });

  it('holds the branch open once a comment is posted, and closes the box', () => {
    const { result } = renderHook(() => useInlineComposer());

    act(() => result.current.open());
    expect(result.current.isComposing).toBe(true);

    act(() => result.current.markPosted('comment-1'));

    expect(result.current.hasPosted).toBe(true);
    expect(result.current.isComposing).toBe(false);
  });

  it('stops holding it when that publish is rejected', () => {
    const { result } = renderHook(() => useInlineComposer());

    act(() => result.current.markPosted('comment-1'));
    act(() => result.current.markPostRejected());

    expect(result.current.hasPosted).toBe(false);
  });

  // A count rather than a flag, so one rejection does not take the branch away from a comment that
  // stood. This is the case a boolean cannot represent in either direction.
  it('keeps holding it for an earlier comment that stood', () => {
    const { result } = renderHook(() => useInlineComposer());

    act(() => result.current.markPosted('comment-1'));
    act(() => result.current.markPosted('comment-2'));
    act(() => result.current.markPostRejected());

    expect(result.current.hasPosted).toBe(true);
  });

  it('never goes below nothing, however many rejections arrive', () => {
    const { result } = renderHook(() => useInlineComposer());

    act(() => result.current.markPosted('comment-1'));
    act(() => result.current.markPostRejected());
    act(() => result.current.markPostRejected());
    act(() => result.current.markPosted('comment-2'));

    expect(result.current.hasPosted).toBe(true);
  });
});
