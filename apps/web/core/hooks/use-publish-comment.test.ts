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

    expect(mocks.createComment).toHaveBeenCalledWith({
      text: 'A reason',
      targetSpaceId: 'space-1',
      ancestorComments: undefined,
      onOptimistic: undefined,
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

  it('reports a publish that failed immediately', async () => {
    mocks.createComment.mockResolvedValue(null);
    const onFailed = vi.fn();

    await publish(onFailed);

    expect(onFailed).toHaveBeenCalledOnce();
  });

  it('does not report one that succeeded', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
    const onFailed = vi.fn();

    await publish(onFailed);

    expect(onFailed).not.toHaveBeenCalled();
  });

  // The case the returned value cannot express: retained now, failed later.
  it('reports a retained publish whose retry fails, and not before', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: false });
    const onFailed = vi.fn();

    await publish(onFailed);

    // Retained, so nothing has failed yet: the row and its counts are still right.
    expect(onFailed).not.toHaveBeenCalled();
    expect(mocks.enqueuePendingAction).toHaveBeenCalledOnce();

    const queued = mocks.enqueuePendingAction.mock.calls[0]![0] as { run: () => Promise<void> };
    mocks.createComment.mockResolvedValue(null);

    await expect(queued.run()).rejects.toThrow('Comment could not be published');
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it('says nothing when the retry succeeds', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: false });
    const onFailed = vi.fn();

    await publish(onFailed);

    const queued = mocks.enqueuePendingAction.mock.calls[0]![0] as { run: () => Promise<void> };
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });

    await queued.run();

    expect(onFailed).not.toHaveBeenCalled();
  });
});
