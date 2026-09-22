import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

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

vi.mock('~/core/hooks/use-publish-comment', () => ({
  usePublishComment: () => ({ publishComment: mocks.createComment }),
}));

describe('ClaimPositionCommentControl', () => {
  beforeEach(() => {
    mocks.createComment.mockReset();
    mocks.createComment.mockResolvedValue({ id: 'comment-1', published: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function renderControl({
    viewerPosition = null,
    promptForComment = true,
    onRespond = vi.fn(),
    responseKind = 'stance',
    positionRowEndSlot,
  }: {
    viewerPosition?: boolean | null;
    promptForComment?: boolean;
    onRespond?: (position: boolean) => void;
    responseKind?: 'stance' | 'veracity';
    positionRowEndSlot?: ReactNode;
  } = {}) {
    render(
      <ClaimPositionCommentControl
        entityId="claim-1"
        spaceId="space-1"
        positions={[]}
        responseKind={responseKind}
        viewerPosition={viewerPosition}
        onRespond={onRespond}
        promptForComment={promptForComment}
        positionRowEndSlot={positionRowEndSlot}
      />
    );
    return { onRespond };
  }

  it('records a new position immediately and keeps the buttons visible above the optional explanation', () => {
    const { onRespond } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    expect(onRespond).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Why do you agree?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();

    const composer = screen.getByRole('textbox').parentElement as HTMLElement;
    expect(composer).toHaveClass('flex', 'items-center');
    expect(composer).not.toHaveClass('flex-col');
    expect(composer.parentElement).toHaveClass('overflow-hidden');
  });

  it('keeps an optional row action after both positions at mobile and desktop widths', () => {
    renderControl({
      positionRowEndSlot: (
        <button type="button" aria-label="Comments (2)">
          2
        </button>
      ),
    });

    const buttons = screen.getAllByRole('button');
    expect(buttons.map(button => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
      'Agree',
      'Disagree',
      'Comments (2)',
    ]);

    const endSlot = screen.getByRole('button', { name: 'Comments (2)' }).parentElement;
    expect(endSlot).toHaveClass('h-7', 'shrink-0');
    expect(endSlot?.parentElement).toHaveClass('grid', 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]');
  });

  it('keeps the actions inline when the hint fits in the available text width', () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockReturnValue(29);
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(29);
    renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    const textarea = screen.getByRole('textbox', { name: 'Why do you agree?' });
    expect(textarea).not.toHaveClass('basis-full');
    expect(screen.getByRole('button', { name: 'Skip' }).parentElement).toHaveClass('ml-auto', 'shrink-0');
  });

  it('grows with the comment until the height cap, then scrolls inside the textarea', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 80 });
    fireEvent.change(textarea, { target: { value: 'A few lines of explanation' } });
    expect(textarea.style.height).toBe('80px');
    expect(textarea.style.overflowY).toBe('hidden');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 200 });
    fireEvent.change(textarea, { target: { value: 'A much longer explanation that exceeds the visible limit' } });
    expect(textarea.style.height).toBe('120px');
    expect(textarea.style.overflowY).toBe('auto');
  });

  it('gives a wrapping mobile hint the full row and moves the actions beneath it', () => {
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockReturnValue(20);
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(40);
    renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));

    const textarea = screen.getByRole('textbox', { name: 'Why do you disagree?' }) as HTMLTextAreaElement;
    expect(textarea).toHaveAttribute('wrap', 'soft');
    expect(textarea).toHaveClass('basis-full', 'max-w-none');
    expect(textarea.style.height).toBe('40px');
    expect(textarea.parentElement).toHaveClass('flex-wrap');
    expect(screen.getByRole('button', { name: 'Skip' }).parentElement).toHaveClass('ml-auto', 'shrink-0');
  });

  it('keeps the actions below after typing replaces a wrapping hint with shorter text', () => {
    let contentHeight = 40;
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockReturnValue(20);
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    const textarea = screen.getByRole('textbox', { name: 'Why do you disagree?' });
    expect(textarea).toHaveClass('basis-full');

    contentHeight = 20;
    fireEvent.change(textarea, { target: { value: 'An A' } });

    expect(textarea).toHaveClass('basis-full', 'max-w-none');
  });

  it('remeasures on container shrink and keeps the resulting two-row layout latched', () => {
    let runResize: ResizeObserverCallback | null = null;
    let contentHeight = 20;
    let composerWidth = 0;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          runResize = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLTextAreaElement.prototype, 'clientHeight', 'get').mockReturnValue(20);
    vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(() => contentHeight);
    renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));
    const textarea = screen.getByRole('textbox', { name: 'Why do you disagree?' });
    const composer = textarea.parentElement as HTMLDivElement;
    Object.defineProperty(composer, 'clientWidth', { configurable: true, get: () => composerWidth });
    expect(textarea).not.toHaveClass('basis-full');

    contentHeight = 40;
    composerWidth = 260;
    act(() => runResize?.([], {} as ResizeObserver));
    expect(textarea).toHaveClass('basis-full', 'max-w-none');

    contentHeight = 20;
    composerWidth = 520;
    act(() => runResize?.([], {} as ResizeObserver));
    expect(textarea).toHaveClass('basis-full', 'max-w-none');
  });

  it('ignores close and publish shortcuts while an IME composition is active', () => {
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Partially composed draft' } });

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true });
    fireEvent.keyDown(textarea, { key: 'Escape', isComposing: true });

    expect(mocks.createComment).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Partially composed draft');
    expect(textarea).toBeInTheDocument();
  });

  it('dismisses the comment invitation without another position write when Skip is pressed', async () => {
    const { onRespond } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(mocks.createComment).not.toHaveBeenCalled();
  });

  it('adds the optional explanation to the claim thread without submitting the position again', async () => {
    const order: string[] = [];
    const onRespond = vi.fn(() => {
      order.push('response');
    });
    mocks.createComment.mockImplementation(async () => {
      order.push('comment');
      return { id: 'comment-1', published: true };
    });
    renderControl({ onRespond });

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Because the evidence supports it.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(mocks.createComment).toHaveBeenCalledTimes(1));
    expect(mocks.createComment).toHaveBeenCalledWith({
      text: 'Because the evidence supports it.',
    });
    expect(onRespond).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['response', 'comment']);
  });

  it('keeps a failed comment draft open so it can be retried', async () => {
    mocks.createComment.mockResolvedValue(null);
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Comment' })).toBeEnabled());
    expect(screen.getByRole('textbox')).toHaveValue('Keep this draft');
  });

  it('holds the position controls steady while the comment is publishing', async () => {
    let finishPublish: ((value: { id: string; published: boolean }) => void) | undefined;
    mocks.createComment.mockReturnValue(
      new Promise(resolve => {
        finishPublish = resolve;
      })
    );
    renderControl();
    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A reason' } });

    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    expect(screen.getByRole('button', { name: 'Agree' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Disagree' })).toBeDisabled();

    finishPublish?.({ id: 'comment-1', published: true });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  });

  it('lets the buttons change the recorded side while the optional prompt is open', () => {
    const { onRespond } = renderControl();

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A draft reason' } });
    fireEvent.click(screen.getByRole('button', { name: 'Disagree' }));

    expect(onRespond).toHaveBeenNthCalledWith(1, true);
    expect(onRespond).toHaveBeenNthCalledWith(2, false);
    expect(screen.getByRole('textbox', { name: 'Why do you disagree?' })).toHaveValue('');
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
    expect(screen.getByRole('button', { name: 'Comment' })).toBeDisabled();
  });

  it('preserves the sign-in flow instead of opening a composer while signed out', () => {
    const { onRespond } = renderControl({ promptForComment: false });

    fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

    expect(onRespond).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
