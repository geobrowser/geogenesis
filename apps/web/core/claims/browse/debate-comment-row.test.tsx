import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommentWithReplies } from '~/partials/comments/types';

const mocks = vi.hoisted(() => ({
  /** Responder space id → the side they hold on the claim, as the provider would resolve it. */
  directions: new Map<string, 'positive' | 'negative'>(),
}));

// The badge under test reads its own context, which the claim page supplies around the whole
// thread. Standing in for the provider keeps this about whether the row asks for the badge at all.
vi.mock('~/core/claims/browse/claim-comment-position', () => ({
  ClaimCommentPositionBadge: ({ authorSpaceId }: { authorSpaceId: string }) => {
    const direction = mocks.directions.get(authorSpaceId);
    if (!direction) return null;
    return <span data-testid="position-badge">{direction === 'positive' ? 'Agree' : 'Disagree'}</span>;
  },
}));

vi.mock('~/core/hooks/use-entity-comments-panel', () => ({
  useEntityCommentsPanel: () => ({ commentsTarget: null, openComments: vi.fn() }),
}));
vi.mock('~/core/state/editor/markdown-render', () => ({ renderMarkdownDocument: (text: string) => text }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));

import { DebateCommentRow } from './debate-comment-row';

function comment(overrides: Partial<CommentWithReplies> = {}): CommentWithReplies {
  return {
    id: 'comment-1',
    name: 'comment',
    markdownContent: 'The containment failure was a misconfiguration, not a capability problem.',
    targetEntityId: 'debate-1',
    targetSpaceId: 'space-1',
    replyToCommentId: null,
    replyToCommentSpaceId: null,
    author: { spaceId: 'author-space', address: '0xabc', name: 'Preston Mantel', avatarUrl: null },
    createdAt: '2026-09-22T10:00:00Z',
    spaceId: 'author-space',
    resolved: false,
    replies: [],
    ...overrides,
  };
}

function renderRow(overrides: Partial<CommentWithReplies> = {}) {
  return render(<DebateCommentRow comment={comment(overrides)} debateId="debate-1" spaceId="space-1" />);
}

describe('DebateCommentRow', () => {
  afterEach(() => {
    cleanup();
    mocks.directions.clear();
  });

  it('shows the author and what they said', () => {
    renderRow();

    expect(screen.getByText('Preston Mantel')).toBeInTheDocument();
    expect(
      screen.getByText('The containment failure was a misconfiguration, not a capability problem.')
    ).toBeInTheDocument();
  });

  // The comment is filed against the debate, but the person holds a position on the claim this page
  // is about — and that is the same commitment a commenter on the claim would be badged for.
  it('badges the author with the position they hold on the claim', () => {
    mocks.directions.set('author-space', 'positive');

    renderRow();

    expect(screen.getByTestId('position-badge')).toHaveTextContent('Agree');
  });

  it('badges a disagreeing author too', () => {
    mocks.directions.set('author-space', 'negative');

    renderRow();

    expect(screen.getByTestId('position-badge')).toHaveTextContent('Disagree');
  });

  it('draws no badge for an author who holds no position on the claim', () => {
    renderRow();

    expect(screen.queryByTestId('position-badge')).not.toBeInTheDocument();
  });

  it('ages the comment the way the surrounding thread does', () => {
    renderRow({ createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() });

    expect(screen.getByText('2d ago')).toBeInTheDocument();
  });

  it('says "Publishing…" instead of an age while the comment is still being written', () => {
    renderRow({ isPublishing: true });

    expect(screen.getByText('Publishing…')).toBeInTheDocument();
  });

  it('offers the replies as a way into the debate’s own thread', () => {
    renderRow({ replies: [comment({ id: 'reply-1' })] });

    expect(screen.getByRole('button', { name: '1 reply' })).toBeInTheDocument();
  });

  it('offers no reply count when nobody has replied', () => {
    renderRow();

    expect(screen.queryByRole('button', { name: /repl(y|ies)$/ })).not.toBeInTheDocument();
  });
});
