import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CommentActivityRow, CommentWithReplies } from './types';

const mocks = vi.hoisted(() => ({
  comments: [] as CommentWithReplies[],
  smartAccount: null as unknown,
  /** Stands in for the optimistic row a real publish writes, which is what tells the section. */
  publishComment: vi.fn((input: { onOptimistic?: (id: string) => void }) => {
    input.onOptimistic?.('new-comment');
    return Promise.resolve(undefined);
  }),
}));

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: () => ({ comments: mocks.comments, totalCount: mocks.comments.length, isLoading: false }),
}));
vi.mock('~/core/hooks/use-publish-comment', () => ({
  usePublishComment: () => ({ publishComment: mocks.publishComment, editComment: vi.fn() }),
}));
vi.mock('~/core/hooks/use-personal-space-id', () => ({ usePersonalSpaceId: () => ({ personalSpaceId: null }) }));
vi.mock('~/core/hooks/use-smart-account', () => ({ useSmartAccount: () => ({ smartAccount: mocks.smartAccount }) }));
vi.mock('~/core/hooks/use-geo-profile', () => ({ useGeoProfile: () => ({ profile: null }) }));
vi.mock('~/core/hooks/use-space-editor-ids', () => ({
  useSpaceRoles: () => ({
    editorSpaceIds: new Set<string>(),
    memberSpaceIds: new Set<string>(),
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('~/core/debates/use-debate-votes', () => ({ useDebateVotesByVoter: () => new Map() }));
vi.mock('~/core/governance/use-proposal-comment-attribution', () => ({
  useProposalCommentAttribution: () => new Map(),
}));
vi.mock('~/core/state/sign-in-prompt-store', () => ({ useSignInPrompt: () => ({ open: vi.fn() }) }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));
vi.mock('~/core/claims/browse/claim-comment-position', () => ({ ClaimCommentPositionBadge: () => null }));
vi.mock('~/core/state/editor/markdown-render', () => ({ renderMarkdownDocument: (text: string) => text }));

import { CommentSection } from './comments-section';

function comment(id: string, createdAt: string): CommentWithReplies {
  return {
    id,
    name: id,
    markdownContent: `body of ${id}`,
    targetEntityId: 'entity-1',
    targetSpaceId: 'space-1',
    replyToCommentId: null,
    replyToCommentSpaceId: null,
    author: { spaceId: `author-${id}`, address: `0x${id}`, name: id, avatarUrl: null },
    createdAt,
    spaceId: `author-${id}`,
    resolved: false,
    replies: [],
  };
}

// Ranked orders subscribe to the vote-count cache, which needs a client even though nothing here
// fetches — the subscriptions are deliberately disabled.
function withClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function renderSection(activityRows: CommentActivityRow[], sort?: 'best' | 'top' | 'newest' | 'oldest') {
  return render(
    withClient(
      <CommentSection
        entityId="entity-1"
        spaceId="space-1"
        title="Activity"
        activityRows={activityRows}
        defaultSortOrder={sort ?? 'newest'}
      />
    )
  );
}

describe('CommentSection activity rows', () => {
  afterEach(() => {
    cleanup();
    mocks.comments = [];
    mocks.smartAccount = null;
    mocks.publishComment.mockClear();
  });

  it('orders non-comment rows in among the comments rather than stacking them above', () => {
    mocks.comments = [comment('c-old', '2026-09-20T10:00:00Z'), comment('c-new', '2026-09-22T10:00:00Z')];

    renderSection([
      { id: 'd-mid', entityId: 'd-mid', spaceId: 'space-1', createdAt: '2026-09-21T10:00:00Z', content: <span>debate mid</span> },
      { id: 'd-newest', entityId: 'd-newest', spaceId: 'space-1', createdAt: '2026-09-23T10:00:00Z', content: <span>debate newest</span> },
    ]);

    const order = screen
      .getAllByText(/body of c-|debate /)
      .map(node => node.textContent?.trim());

    // Newest first, which is the section's default sort — and the two kinds interleave.
    expect(order).toEqual(['debate newest', 'body of c-new', 'debate mid', 'body of c-old']);
  });

  // With nothing voted on, Best has no scores to separate rows by and falls back to recency —
  // which is what keeps a fresh thread from looking randomly ordered.
  it('falls back to newest within Best while no votes have been counted', () => {
    mocks.comments = [comment('c-old', '2026-09-20T10:00:00Z'), comment('c-new', '2026-09-22T10:00:00Z')];

    renderSection(
      [{ id: 'd-mid', entityId: 'd-mid', spaceId: 'space-1', createdAt: '2026-09-21T10:00:00Z', content: <span>debate mid</span> }],
      'best'
    );

    const order = screen.getAllByText(/body of c-|debate /).map(node => node.textContent?.trim());
    expect(order).toEqual(['body of c-new', 'debate mid', 'body of c-old']);
  });

  it('counts activity rows in the heading alongside the comments', () => {
    mocks.comments = [comment('c-1', '2026-09-20T10:00:00Z')];

    renderSection([{ id: 'd-1', entityId: 'd-1', spaceId: 'space-1', createdAt: '2026-09-21T10:00:00Z', content: <span>debate</span> }]);

    expect(screen.getByText('Activity (2)')).toBeInTheDocument();
  });

  /**
   * The heading's number is a server aggregate over debates, extracted claims and every comment
   * under them, so nothing in the comment caches can move it — publishing used to leave it standing
   * still, including for the comment the reader had just written.
   */
  it('counts a comment published here on top of the aggregate it was given', async () => {
    // Signed in, because the composer asks for a sign-in rather than opening otherwise.
    mocks.smartAccount = { account: { address: '0xabc' } };
    render(
      withClient(
        <CommentSection entityId="entity-1" spaceId="space-1" title="Activity" totalOverride={33} activityRows={[]} />
      )
    );

    expect(screen.getByText('Activity (33)')).toBeInTheDocument();

    // What a composer does on publish: the section is told, whichever entity the comment landed on.
    fireEvent.click(screen.getByText('Join the conversation...'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A new comment' } });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(screen.getByText('Activity (34)')).toBeInTheDocument());
  });

  it('renders the rows on a claim nobody has commented on yet', () => {
    renderSection([{ id: 'd-1', entityId: 'd-1', spaceId: 'space-1', createdAt: '2026-09-21T10:00:00Z', content: <span>debate</span> }]);

    expect(screen.getByText('debate')).toBeInTheDocument();
    expect(screen.getByText('Activity (1)')).toBeInTheDocument();
  });

  it('leaves the thread exactly as it was when no rows are passed', () => {
    mocks.comments = [comment('c-1', '2026-09-20T10:00:00Z')];

    render(withClient(<CommentSection entityId="entity-1" spaceId="space-1" />));

    expect(screen.getByText('Comments (1)')).toBeInTheDocument();
    expect(screen.getByText('body of c-1')).toBeInTheDocument();
  });
});
