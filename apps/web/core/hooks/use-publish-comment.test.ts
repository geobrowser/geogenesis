import { act, renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePublishComment } from './use-publish-comment';

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  createComment: vi.fn(),
  editComment: vi.fn(),
  enqueuePendingAction: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture }));

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
    mocks.capture.mockReset();
    mocks.createComment.mockReset();
    mocks.editComment.mockReset();
    mocks.enqueuePendingAction.mockReset();
  });

  it('returns a completed publish without adding a pending action', async () => {
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));

    await act(() => result.current.publishComment({ text: 'A reason' }));

    expect(mocks.createComment).toHaveBeenCalledWith({
      text: 'A reason',
      targetSpaceId: 'space-1',
      ancestorComments: undefined,
      onOptimistic: undefined,
    });
    expect(mocks.enqueuePendingAction).not.toHaveBeenCalled();
    expect(mocks.capture).toHaveBeenCalledWith('comment_created', {
      source: 'commenting',
      comment_id: 'comment-1',
      target_type: 'entity',
      target_id: 'claim-1',
      space_id: 'space-1',
      parent_comment_id: undefined,
    });
  });

  it('retries the same optimistic comment after the personal space becomes ready', async () => {
    mocks.createComment
      .mockResolvedValueOnce({ id: 'comment-1', published: false })
      .mockResolvedValueOnce({ id: 'comment-1', published: true });
    const { result } = renderHook(() => usePublishComment('claim-1', 'space-1'));

    await act(() => result.current.publishComment({ text: 'A reason' }));

    expect(mocks.capture).not.toHaveBeenCalled();

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
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith(
      'comment_created',
      expect.objectContaining({ comment_id: 'comment-1', target_id: 'claim-1', space_id: 'space-1' })
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

    expect(mocks.capture).toHaveBeenCalledWith(
      'comment_created',
      expect.objectContaining({
        comment_id: 'comment-2',
        target_type: 'entity',
        target_id: 'claim-1',
        parent_comment_id: 'comment-1',
      })
    );
  });
});
