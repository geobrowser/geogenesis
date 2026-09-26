import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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
