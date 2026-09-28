import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePublishComment } from './use-publish-comment';

const mocks = vi.hoisted(() => ({
  commentCreated: vi.fn(),
  commentEdited: vi.fn(),
  createComment: vi.fn(),
  editComment: vi.fn(),
  enqueuePendingAction: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({
  commentCreated: mocks.commentCreated,
  commentEdited: mocks.commentEdited,
}));

vi.mock('./use-create-comment', () => ({
  useCreateComment: () => ({
    createComment: mocks.createComment,
    editComment: mocks.editComment,
    isCreating: false,
    error: null,
  }),
}));

vi.mock('~/core/state/pending-actions', () => ({
  useEnqueuePendingAction: () => mocks.enqueuePendingAction,
}));

describe('usePublishComment', () => {
  beforeEach(() => {
    mocks.commentCreated.mockReset();
    mocks.commentEdited.mockReset();
    mocks.createComment.mockReset();
    mocks.editComment.mockReset();
    mocks.enqueuePendingAction.mockReset();
  });

  it('returns a completed publish without adding a pending action', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
    const { result } = renderHook(() =>
      usePublishComment('claim-1', 'space-1', {
        targetEntityType: 'claim',
        interactionSurface: 'claim_page',
      })
    );

    await act(() => result.current.publishComment({ text: 'A reason' }));

    // `onOptimistic` is the hook's own wrapper — it records that the row was counted, so a later
    // failure knows whether a `-1` is owed — rather than the caller's callback passed straight through.
    expect(mocks.createComment).toHaveBeenCalledWith({
      text: 'A reason',
      targetSpaceId: 'space-1',
      ancestorComments: undefined,
      onOptimistic: expect.any(Function),
    });
    expect(mocks.enqueuePendingAction).not.toHaveBeenCalled();
    expect(mocks.commentCreated).toHaveBeenCalledWith('comment-1', 'claim-1', {
      space_id: 'space-1',
      parent_comment_id: undefined,
      target_entity_type: 'claim',
      interaction_surface: 'claim_page',
    });
  });

  it('retries the same optimistic comment after the personal space becomes ready', async () => {
    mocks.createComment
      .mockResolvedValueOnce({ id: 'comment-1', published: false })
      .mockResolvedValueOnce({ id: 'comment-1', published: true });
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));

    await act(() => result.current.publishComment({ text: 'A reason' }));

    expect(mocks.commentCreated).not.toHaveBeenCalled();

    expect(mocks.enqueuePendingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'comment:claim-1:comment-1',
        label: 'your comment',
        requires: 'personalSpace',
      })
    );

    const pending = mocks.enqueuePendingAction.mock.calls[0]?.[0] as { run: () => Promise<void> };
    await act(() => pending.run());

    expect(mocks.createComment).toHaveBeenLastCalledWith({
      text: 'A reason',
      targetSpaceId: 'space-1',
      ancestorComments: undefined,
      commentId: 'comment-1',
      // The retry is counted when its row is put back, so it is handed the same counter.
      onOptimistic: expect.any(Function),
    });
    expect(mocks.commentCreated).toHaveBeenCalledTimes(1);
    expect(mocks.commentCreated).toHaveBeenCalledWith(
      'comment-1',
      'claim-1',
      expect.objectContaining({ space_id: 'space-1' })
    );
  });

  it('attributes replies to both the entity and their parent comment', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-2', published: true });
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));

    await act(() =>
      result.current.publishComment({
        text: 'A reply',
        ancestorComments: [{ id: 'comment-1', spaceId: 'author-space' }],
      })
    );

    expect(mocks.commentCreated).toHaveBeenCalledWith(
      'comment-2',
      'claim-1',
      expect.objectContaining({ parent_comment_id: 'comment-1' })
    );
  });

  it('records a comment edit only after it publishes successfully', async () => {
    mocks.editComment.mockResolvedValue(true);
    const { result } = renderHook(() =>
      usePublishComment('claim-1', 'space-1', {
        targetEntityType: 'claim',
        interactionSurface: 'claim_page',
      })
    );

    await act(() =>
      result.current.editComment({ commentId: 'comment-1', commentSpaceId: 'author-space', newText: 'Revised' })
    );

    expect(mocks.commentEdited).toHaveBeenCalledWith('comment-1', 'claim-1', {
      space_id: 'space-1',
      target_entity_type: 'claim',
      interaction_surface: 'claim_page',
    });

    mocks.editComment.mockResolvedValue(false);
    await act(() =>
      result.current.editComment({ commentId: 'comment-1', commentSpaceId: 'author-space', newText: 'Rejected' })
    );
    expect(mocks.commentEdited).toHaveBeenCalledTimes(1);
  });
});

/**
 * Who hears that the comment did not make it.
 *
 * Callers used to read the returned value, and that only ever sees the first attempt. A publish
 * retained for a personal space that does not exist yet resolves *truthy* and is retried later — so
 * when that retry failed, `useCreateComment` removed the optimistic row while every count and flag the
 * caller had set for it stayed behind: the Activity total one too high, and a row holding a branch open
 * for a comment that no longer existed.
 */
describe('usePublishComment reporting a failure', () => {
  beforeEach(() => {
    mocks.commentCreated.mockReset();
    mocks.createComment.mockReset();
    mocks.enqueuePendingAction.mockReset();
  });

  function publish(onFailed: () => void) {
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));
    return act(() => result.current.publishComment({ text: 'A comment', onFailed }) as Promise<unknown>);
  }

  /**
   * What `useCreateComment` does: inserts the optimistic row and reports it, then resolves. `inserted`
   * is false for the one outcome where it gives up before inserting anything.
   */
  function createCommentThat(outcome: unknown, { inserted = true }: { inserted?: boolean } = {}) {
    mocks.createComment.mockImplementation(
      async (input: { onOptimistic?: (id: string) => void; commentId?: string }) => {
        // A retry passes the existing id and no callback; the first attempt passes a callback.
        if (inserted) input.onOptimistic?.('comment-1');
        return outcome;
      }
    );
  }

  it('reports a publish that failed after its row was counted', async () => {
    createCommentThat(null);
    const onFailed = vi.fn();

    await publish(onFailed);

    expect(onFailed).toHaveBeenCalledOnce();
  });

  /**
   * `createComment` can give up before it inserts anything — no cached account, for one — and the old
   * path reported a failure regardless. Callers treat the two callbacks as a balanced `+1`/`-1`, so that
   * took back a count that was never taken: the Activity total one *low*.
   */
  it('reports nothing for a publish that failed before any row existed', async () => {
    createCommentThat(null, { inserted: false });
    const onFailed = vi.fn();

    await publish(onFailed);

    expect(onFailed).not.toHaveBeenCalled();
  });

  it('does not report one that succeeded', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
    const onFailed = vi.fn();

    await publish(onFailed);

    expect(onFailed).not.toHaveBeenCalled();
  });

  // The case the returned value cannot express: retained now, failed later.
  it('reports a retained publish whose retry fails, and not before', async () => {
    createCommentThat({ id: 'comment-1', published: false });
    const onFailed = vi.fn();

    await publish(onFailed);

    // Retained, so nothing has failed yet: the row and its counts are still right.
    expect(onFailed).not.toHaveBeenCalled();
    expect(mocks.enqueuePendingAction).toHaveBeenCalledOnce();

    const queued = mocks.enqueuePendingAction.mock.calls[0]![0] as { run: () => Promise<void> };
    createCommentThat(null);

    await expect(queued.run()).rejects.toThrow('Comment could not be published');
    expect(onFailed).toHaveBeenCalledOnce();
  });

  /**
   * `PendingActionsRunner` keeps a failed action queued and its error toast offers a retry that runs it
   * again, so this is not once-only. Reported per attempt, one comment took the count down twice, three
   * times, as many times as the reader pressed retry — and a retry that finally succeeded never gave it
   * back. The two callbacks are a transition, not an event.
   */
  /**
   * The count follows the row, and the row is what the reader can see.
   *
   * A failed attempt takes the optimistic row out (`useCreateComment`'s failure path), and a retry puts
   * it back — it used to skip that, assuming its row was still there, and the success was counted
   * regardless: the Activity heading reported a comment the thread was not drawing. Now every insertion
   * is reported and every removal is reversed, so at each step the count equals the rows present.
   *
   * The stand-in models that cache: a row is inserted, and reported, only when it is not already there.
   */
  it('keeps the count equal to the rows present through failed retries and a successful one', async () => {
    let rowPresent = false;
    let nextResult: unknown = { id: 'comment-1', published: false };
    mocks.createComment.mockImplementation(async (input: { onOptimistic?: (id: string) => void }) => {
      if (!rowPresent) {
        rowPresent = true;
        input.onOptimistic?.('comment-1');
      }
      // A failure takes the row back out, as the real hook does.
      if (nextResult == null) rowPresent = false;
      return nextResult;
    });

    const counted: number[] = [];
    const total = () => counted.reduce((a, b) => a + b, 0);
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));

    await act(() =>
      result.current.publishComment({
        text: 'A comment',
        onOptimistic: () => void counted.push(1),
        onFailed: () => void counted.push(-1),
      })
    );

    // Retained: its row is there, and so is its count.
    expect(total()).toBe(1);
    expect(rowPresent).toBe(true);

    const queued = mocks.enqueuePendingAction.mock.calls[0]![0] as { run: () => Promise<void> };
    nextResult = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(queued.run()).rejects.toThrow();
      // Never above the rows actually present, however many attempts fail.
      expect(total()).toBe(rowPresent ? 1 : 0);
      expect(total()).toBeGreaterThanOrEqual(0);
    }

    nextResult = { id: 'comment-1', published: true };
    await queued.run();

    // The row is back, so the comment counts — once.
    expect(rowPresent).toBe(true);
    expect(total()).toBe(1);
  });

  it('says nothing when the retry succeeds', async () => {
    createCommentThat({ id: 'comment-1', published: false });
    const onFailed = vi.fn();

    await publish(onFailed);

    const queued = mocks.enqueuePendingAction.mock.calls[0]![0] as { run: () => Promise<void> };
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });

    await queued.run();

    expect(onFailed).not.toHaveBeenCalled();
  });
});
