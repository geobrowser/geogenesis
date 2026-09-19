import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimPositionCommentControl } from './claim-position-comment';

const mocks = vi.hoisted(() => ({
  createComment: vi.fn(),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, pending: null }),
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
}));

vi.mock('~/core/hooks/use-create-comment', () => ({
  useCreateComment: () => ({ createComment: mocks.createComment }),
}));

describe('ClaimPositionCommentControl', () => {
  beforeEach(() => {
    mocks.createComment.mockReset();
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
  });

  afterEach(cleanup);

  function renderControl({
    viewerPosition = null,
    promptForComment = true,
    onRespond = vi.fn(),
    onRespondAsync = vi.fn().mockResolvedValue(true),
    responseKind = 'stance',
  }: {
    viewerPosition?: boolean | null;
    promptForComment?: boolean;
    onRespond?: (position: boolean) => void;
    onRespondAsync?: (position: boolean) => Promise<boolean>;
    responseKind?: 'stance' | 'veracity';
  } = {}) {
    render(
      <ClaimPositionCommentControl
        entityId="claim-1"
        spaceId="space-1"
        positions={[]}
        responseKind={responseKind}
        viewerPosition={viewerPosition}
        onRespond={onRespond}
        onRespondAsync={onRespondAsync}
        promptForComment={promptForComment}
      />
    );
    return { onRespond, onRespondAsync };
  }

  it('offers an optional explanation before taking a new position', () => {
    const { onRespond } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    expect(screen.getByRole('textbox', { name: 'Why do you agree?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();
  });

  it('returns to the position buttons without publishing when Back is pressed', () => {
    const { onRespond, onRespondAsync } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    expect(onRespond).not.toHaveBeenCalled();
    expect(onRespondAsync).not.toHaveBeenCalled();
  });

  it('publishes the position without a comment when Skip is pressed', async () => {
    const { onRespondAsync } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    await waitFor(() => expect(onRespondAsync).toHaveBeenCalledWith(false));
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it('publishes the response first, then adds the explanation to the claim thread', async () => {
    const order: string[] = [];
    const onRespondAsync = vi.fn(async () => {
      order.push('response');
      return true;
    });
    mocks.createComment.mockImplementation(async () => {
      order.push('comment');
      return { id: 'comment-1', published: true };
    });
    renderControl({ onRespondAsync });

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Because the evidence supports it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    await waitFor(() => expect(mocks.createComment).toHaveBeenCalledTimes(1));
    expect(mocks.createComment).toHaveBeenCalledWith({
      text: 'Because the evidence supports it.',
      targetSpaceId: 'space-1',
    });
    expect(order).toEqual(['response', 'comment']);
  });

  it('keeps the explanation open when the response fails and does not publish the comment', async () => {
    const onRespondAsync = vi.fn().mockResolvedValue(false);
    renderControl({ onRespondAsync });

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    await waitFor(() => expect(onRespondAsync).toHaveBeenCalledWith(true));
    expect(screen.getByRole('textbox')).toHaveValue('My reason');
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it('withdraws an already-held position directly', () => {
    const { onRespond } = renderControl({ viewerPosition: true });

    fireEvent.click(screen.getByRole('button', { name: /Agree/ }));

    expect(onRespond).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uses the factual-claim vocabulary in the prompt', () => {
    renderControl({ responseKind: 'veracity' });

    fireEvent.click(screen.getByRole('button', { name: 'Dispute' }));

    expect(screen.getByRole('textbox', { name: 'Why do you dispute?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dispute' })).toBeInTheDocument();
  });

  it('preserves the sign-in flow instead of opening a composer while signed out', () => {
    const { onRespond } = renderControl({ promptForComment: false });

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    expect(onRespond).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
