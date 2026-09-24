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
