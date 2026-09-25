import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommentWithReplies } from '~/partials/comments/types';

import { ACTIVITY_MAX_DEPTH } from './claim-activity-depth';
import { DebateCommentRow } from './debate-comment-row';

const mocks = vi.hoisted(() => ({
  /** Responder space id → the side they hold on the claim, as the provider would resolve it. */
  directions: new Map<string, 'positive' | 'negative'>(),
  /** Personal-space ids whose profile the row asked to open, in order. */
  openedProfiles: [] as string[],
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

vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({
  useOpenDebaterProfile: (spaceId: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    mocks.openedProfiles.push(spaceId);
  },
}));
// The composer itself is covered where it lives; here the question is only whether the row opens
// one, against the right entity, carrying the right ancestor chain.
vi.mock('~/partials/comments/inline-comment-composer', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  // Visibility lives in the component, not in the row, so the stand-in has to honour it too.
  InlineCommentComposer: ({
    composer,
    targetEntityId,
    ancestors,
  }: {
    composer: { isComposing: boolean };
    targetEntityId: string;
    ancestors?: Array<{ id: string }>;
  }) =>
    composer.isComposing ? (
      <div
        data-testid="inline-composer"
        data-target={targetEntityId}
        data-ancestors={(ancestors ?? []).map(ancestor => ancestor.id).join(',')}
      />
    ) : null,
}));
vi.mock('~/core/state/editor/markdown-render', () => ({ renderMarkdownDocument: (text: string) => text }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <a {...(props as Record<string, string>)}>{children}</a>
  ),
}));

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

// Depth is counted from the claim: 1 is a debate or a top-level comment, 4 is the floor.
function renderRow(overrides: Partial<CommentWithReplies> = {}, depth = 2) {
  return render(
    <DebateCommentRow comment={comment(overrides)} targetEntityId="debate-1" spaceId="space-1" depth={depth} />
  );
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

  it('draws its replies while there is depth left', () => {
    renderRow({ replies: [comment({ id: 'reply-1', markdownContent: 'a reply' })] });

    expect(screen.getByText('a reply')).toBeInTheDocument();
    // Drawn, so offering to continue elsewhere would be saying the same thing twice.
    expect(screen.queryByRole('link', { name: /Continue this thread/ })).not.toBeInTheDocument();
  });

  // At the floor there is no room to draw them, so the reader is sent to the page where this thread
  // is the whole page rather than a branch of one. A navigation, not a load — Reddit's distinction.
  it('offers to continue the thread on its own entity once it hits the floor', () => {
    renderRow({ replies: [comment({ id: 'reply-1', markdownContent: 'a reply' })] }, ACTIVITY_MAX_DEPTH);

    expect(screen.queryByText('a reply')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Continue this thread — 1 more reply' });
    // This comment, in the space it lives in — not the debate it hangs under. Its own page roots the
    // branch the reader was reading; the debate's reopens the whole thread one level up.
    expect(link).toHaveAttribute('href', expect.stringContaining('comment-1'));
    expect(link).toHaveAttribute('href', expect.stringContaining('author-space'));
    expect(link).not.toHaveAttribute('href', expect.stringContaining('debate-1'));
  });

  /**
   * How many rows are down there, which is what the control promises and what makes the offer worth
   * taking. It counted this comment's own replies, so a single reply carrying ten of its own read as
   * "Continue this thread (1)" — undersold by an order of magnitude on exactly the threads deep enough
   * to reach the floor.
   */
  it('counts every reply below it, not just the ones hanging off it directly', () => {
    renderRow(
      {
        replies: [
          comment({
            id: 'reply-1',
            markdownContent: 'a reply',
            replies: [
              comment({ id: 'reply-1-1', replies: [comment({ id: 'reply-1-1-1' })] }),
              comment({ id: 'reply-1-2' }),
            ],
          }),
          comment({ id: 'reply-2' }),
        ],
      },
      ACTIVITY_MAX_DEPTH
    );

    // Five: two replies, two under the first of those, and one under the first of *those*.
    expect(screen.getByRole('link', { name: 'Continue this thread — 5 more replies' })).toBeInTheDocument();
  });

  // An optimistic reply is inserted before its `replies` array exists, and a count that walks the
  // tree must not throw on it — the row guards its own `replies` read for the same reason.
  it('survives a reply with no replies array at all', () => {
    renderRow(
      { replies: [comment({ id: 'reply-1', replies: undefined as unknown as CommentWithReplies[] })] },
      ACTIVITY_MAX_DEPTH
    );

    expect(screen.getByRole('link', { name: 'Continue this thread — 1 more reply' })).toBeInTheDocument();
  });

  // The other overflow: siblings held back for length. Already loaded, so it reveals in place.
  it('holds back a long reply list and reveals it in place', async () => {
    const replies = Array.from({ length: 5 }, (_, i) =>
      comment({ id: `reply-${i}`, markdownContent: `reply body ${i}` })
    );
    renderRow({ replies });

    expect(screen.getByText('reply body 0')).toBeInTheDocument();
    expect(screen.queryByText('reply body 4')).not.toBeInTheDocument();

    const more = screen.getByRole('button', { name: 'Show 2 more replies' });
    expect(more).toBeInTheDocument();
    // In place — no navigation offered for siblings we already hold.
    expect(screen.queryByRole('link', { name: /Continue this thread/ })).not.toBeInTheDocument();

    fireEvent.click(more);
    expect(screen.getByText('reply body 4')).toBeInTheDocument();
  });

  it('offers no reply count when nobody has replied', () => {
    renderRow();

    expect(screen.queryByRole('button', { name: /repl(y|ies)$/ })).not.toBeInTheDocument();
  });
});

describe('DebateCommentRow, replying and naming', () => {
  afterEach(() => {
    cleanup();
    mocks.openedProfiles.length = 0;
  });

  it('opens a composer against the entity the comment replies to, not against the comment', () => {
    renderRow();

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

    const composer = screen.getByTestId('inline-composer');
    // The reply is filed against the debate — a reply to a comment on a debate is a comment on the
    // debate — with the comment it answers as its nearest ancestor.
    expect(composer).toHaveAttribute('data-target', 'debate-1');
    expect(composer).toHaveAttribute('data-ancestors', 'comment-1');
  });

  it('carries the whole ancestor chain down a nested reply', () => {
    renderRow({ replies: [comment({ id: 'reply-1', markdownContent: 'Second.' })] });

    // The nested row's own Reply, not the parent's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Reply' })[1]!);

    expect(screen.getByTestId('inline-composer')).toHaveAttribute('data-ancestors', 'reply-1,comment-1');
  });

  it('closes the composer when Reply is pressed again', () => {
    renderRow();
    const reply = screen.getByRole('button', { name: 'Reply' });

    fireEvent.click(reply);
    expect(screen.queryByTestId('inline-composer')).toBeInTheDocument();

    fireEvent.click(reply);
    expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument();
  });

  // A comment from someone holding no position and a claim with no assertable moment carry exactly
  // the same furniture, so each row says which it is rather than leaving it to be inferred.
  it('labels itself a comment', () => {
    renderRow();

    expect(screen.getByText('Comment')).toBeInTheDocument();
  });

  // The name keeps its href so middle-click still reaches the person's space; the plain click opens
  // the profile beside the thread instead of navigating away from it.
  it('opens the author profile from the name without leaving the page', () => {
    renderRow();

    fireEvent.click(screen.getByText('Preston Mantel'));

    expect(mocks.openedProfiles).toEqual(['author-space']);
  });
});
