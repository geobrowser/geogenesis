import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';

import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InlineCommentComposer, useInlineComposer } from './inline-comment-composer';

const mocks = vi.hoisted(() => ({ signedIn: false, promptSignIn: vi.fn() }));

vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.signedIn ? { account: { address: '0xabc' } } : null }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => mocks.promptSignIn }));
vi.mock('~/core/hooks/use-publish-comment', () => ({
  usePublishComment: () => ({ publishComment: vi.fn(), editComment: vi.fn() }),
}));

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

/**
 * A signed-out press, and what happens to it.
 *
 * The box asks for sign-in before it opens rather than after a draft is typed into it, which is right —
 * but it used to open Privy, close itself, and forget. A reader who signed in came back to a shut box
 * and had to find the control again, which is not what pressing it said would happen. `CommentSection`
 * already keeps that intent in `pendingCommentComposerAtom`; this uses the same atom so the two cannot
 * disagree about it.
 */
describe('InlineCommentComposer across sign-in', () => {
  beforeEach(() => {
    mocks.signedIn = false;
    mocks.promptSignIn.mockClear();
  });
  afterEach(cleanup);

  function Host({ ancestors }: { ancestors?: Array<{ id: string; spaceId: string }> } = {}) {
    const composer = useInlineComposer();
    return (
      <>
        <button type="button" onClick={composer.toggle}>
          comment
        </button>
        <span data-testid="composing">{String(composer.isComposing)}</span>
        <InlineCommentComposer
          composer={composer}
          targetEntityId="debate-1"
          targetSpaceId="space-1"
          targetEntityType="debate"
          placeholder="Comment on this debate..."
          ancestors={ancestors}
        />
      </>
    );
  }

  it('remembers the press and opens the box once the reader is signed in', () => {
    const view = render(
      <Provider>
        <Host />
      </Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'comment' }));

    // Privy was asked, and the box closed rather than sitting there unusable.
    expect(mocks.promptSignIn).toHaveBeenCalledOnce();
    expect(screen.getByTestId('composing')).toHaveTextContent('false');

    mocks.signedIn = true;
    view.rerender(
      <Provider>
        <Host />
      </Provider>
    );

    expect(screen.getByTestId('composing')).toHaveTextContent('true');
  });

  // Two composers can target the same debate — its own, and a reply under one of its comments — so the
  // intent is keyed by the reply as well, or one press would open both.
  it('does not open a reply composer for a press on the row itself', () => {
    const view = render(
      <Provider>
        <Host />
      </Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'comment' }));

    mocks.signedIn = true;
    view.rerender(
      <Provider>
        <Host ancestors={[{ id: 'comment-1', spaceId: 'space-1' }]} />
      </Provider>
    );

    expect(screen.getByTestId('composing')).toHaveTextContent('false');
  });
});
