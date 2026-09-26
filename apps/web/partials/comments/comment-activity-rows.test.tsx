import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adjustClaimActivityTotal,
  claimActivityCountsQueryKey,
  useClaimActivityCounts,
} from '~/core/claims/browse/claim-activity-count';
import type { ClaimActivityCount } from '~/core/claims/browse/claim-activity-fields';
import { uuidToHex } from '~/core/id/normalize';

import { CommentSection } from './comments-section';
import type { CommentActivityRow, CommentWithReplies } from './types';

const mocks = vi.hoisted(() => ({
  comments: [] as CommentWithReplies[],
  smartAccount: null as unknown,
  /**
   * What the publish resolves to. `useCreateComment` answers falsy only when the transaction was
   * rejected and it has taken the optimistic row back out, which is the rollback signal.
   */
  publishResult: { id: 'new-comment' } as unknown,
  /** Stands in for the optimistic row a real publish writes, which is what tells the section. */
  publishComment: vi.fn((input: { onOptimistic?: (id: string) => void }) => {
    input.onOptimistic?.('new-comment');
    return Promise.resolve(mocks.publishResult);
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
// #2583 deleted the sign-up interstitial and its store; every gate now opens Privy directly.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({ usePrivySignIn: () => vi.fn() }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({ EntityVoteButtons: () => null }));
vi.mock('~/core/claims/browse/claim-comment-position', () => ({ ClaimCommentPositionBadge: () => null }));
vi.mock('~/core/state/editor/markdown-render', () => ({ renderMarkdownDocument: (text: string) => text }));
// The aggregate is seeded straight into the query cache, so nothing here should ever ask the server
// for it. Loudly rather than silently, so a test that accidentally leaves the cache empty fails.
vi.mock('~/core/io/graphql-client', () => ({
  graphql: () => {
    throw new Error('the activity aggregate should be read from the cache in this suite');
  },
}));

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

/** Drive the top-level composer the way a reader does. */
async function publishAComment(text = 'A new comment') {
  fireEvent.click(screen.getByText('Join the conversation...'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
}

describe('CommentSection activity rows', () => {
  afterEach(() => {
    cleanup();
    mocks.comments = [];
    mocks.smartAccount = null;
    mocks.publishResult = { id: 'new-comment' };
    mocks.publishComment.mockClear();
  });

  it('orders non-comment rows in among the comments rather than stacking them above', () => {
    mocks.comments = [comment('c-old', '2026-09-20T10:00:00Z'), comment('c-new', '2026-09-22T10:00:00Z')];

    renderSection([
      {
        id: 'd-mid',
        entityId: 'd-mid',
        spaceId: 'space-1',
        createdAt: '2026-09-21T10:00:00Z',
        content: <span>debate mid</span>,
      },
      {
        id: 'd-newest',
        entityId: 'd-newest',
        spaceId: 'space-1',
        createdAt: '2026-09-23T10:00:00Z',
        content: <span>debate newest</span>,
      },
    ]);

    const order = screen.getAllByText(/body of c-|debate /).map(node => node.textContent?.trim());

    // Newest first, which is the section's default sort — and the two kinds interleave.
    expect(order).toEqual(['debate newest', 'body of c-new', 'debate mid', 'body of c-old']);
  });

  // With nothing voted on, Best has no scores to separate rows by and falls back to recency —
  // which is what keeps a fresh thread from looking randomly ordered.
  it('falls back to newest within Best while no votes have been counted', () => {
    mocks.comments = [comment('c-old', '2026-09-20T10:00:00Z'), comment('c-new', '2026-09-22T10:00:00Z')];

    renderSection(
      [
        {
          id: 'd-mid',
          entityId: 'd-mid',
          spaceId: 'space-1',
          createdAt: '2026-09-21T10:00:00Z',
          content: <span>debate mid</span>,
        },
      ],
      'best'
    );

    const order = screen.getAllByText(/body of c-|debate /).map(node => node.textContent?.trim());
    expect(order).toEqual(['body of c-new', 'debate mid', 'body of c-old']);
  });

  it('counts activity rows in the heading alongside the comments', () => {
    mocks.comments = [comment('c-1', '2026-09-20T10:00:00Z')];

    renderSection([
      {
        id: 'd-1',
        entityId: 'd-1',
        spaceId: 'space-1',
        createdAt: '2026-09-21T10:00:00Z',
        content: <span>debate</span>,
      },
    ]);

    expect(screen.getByText('Activity (2)')).toBeInTheDocument();
  });

  /**
   * The heading's number is a server aggregate over debates, extracted claims and every comment
   * under them, so nothing in the comment caches can move it — publishing used to leave it standing
   * still, including for the comment the reader had just written.
   */
  it('reports a comment published here to whoever owns the number', async () => {
    // Signed in, because the composer asks for a sign-in rather than opening otherwise.
    mocks.smartAccount = { account: { address: '0xabc' } };
    const reported: number[] = [];
    render(
      withClient(
        <CommentSection
          entityId="entity-1"
          spaceId="space-1"
          title="Activity"
          totalOverride={33}
          onActivityPublish={delta => reported.push(delta)}
          activityRows={[]}
        />
      )
    );

    expect(screen.getByText('Activity (33)')).toBeInTheDocument();

    await publishAComment();

    // The section does not move the number itself — it cannot, the aggregate counts things it never
    // sees — so what it owes the host is the fact that a comment appeared.
    await waitFor(() => expect(reported).toEqual([1]));
  });

  // The other half of the same contract. `useCreateComment` resolves falsy when the transaction is
  // rejected and removes the optimistic row, so the count has to be given back.
  it('reports the comment going away again when the publish is rejected', async () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    // Rejected: `useCreateComment` resolves falsy and has already removed the optimistic row.
    mocks.publishResult = undefined;
    const reported: number[] = [];
    render(
      withClient(
        <CommentSection
          entityId="entity-1"
          spaceId="space-1"
          title="Activity"
          totalOverride={33}
          onActivityPublish={delta => reported.push(delta)}
          activityRows={[]}
        />
      )
    );

    await publishAComment();

    await waitFor(() => expect(reported).toEqual([1, -1]));
  });

  it('renders the rows on a claim nobody has commented on yet', () => {
    renderSection([
      {
        id: 'd-1',
        entityId: 'd-1',
        spaceId: 'space-1',
        createdAt: '2026-09-21T10:00:00Z',
        content: <span>debate</span>,
      },
    ]);

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

/**
 * The claim page's wiring, in miniature: it reads the aggregate, hands the number down, and puts the
 * reader's own comment back into the same cache the number came out of.
 */
function ActivityHost({ claimId }: { claimId: string }) {
  const counts = useClaimActivityCounts(React.useMemo(() => [claimId], [claimId]));
  const queryClient = useQueryClient();

  return (
    <CommentSection
      entityId="entity-1"
      spaceId="space-1"
      title="Activity"
      activityRows={[]}
      totalOverride={counts.get(uuidToHex(claimId))?.total}
      onActivityPublish={delta => adjustClaimActivityTotal(queryClient, claimId, delta)}
    />
  );
}

function seedAggregate(client: QueryClient, claimId: string, total: number) {
  const counts = new Map<string, ClaimActivityCount>([
    [uuidToHex(claimId), { total, comments: 1, debates: 0, extractedClaims: 0 } as ClaimActivityCount],
  ]);
  client.setQueryData(claimActivityCountsQueryKey([uuidToHex(claimId)]), counts);
}

/**
 * Where the reader's own comment is counted, and why it is not counted in the section.
 *
 * It used to be: `CommentSection` held the delta in `useState`. Both ends of that state's life were
 * wrong. React Query holds the aggregate for a minute, so leaving the page and coming back inside
 * that minute produced the pre-publish number with a delta that had reset — the heading dropped a
 * comment that was still sitting in the list underneath it. And `EntityPageBody` is reused between
 * records rather than remounted, so walking to the next claim carried the delta onto a number that
 * had never heard of it.
 */
describe('a comment the reader just published', () => {
  const CLAIM_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const CLAIM_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  afterEach(() => {
    cleanup();
    mocks.comments = [];
    mocks.smartAccount = null;
    mocks.publishResult = { id: 'new-comment' };
    mocks.publishComment.mockClear();
  });

  it('is still counted after the section is unmounted and mounted again', async () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedAggregate(client, CLAIM_A, 33);

    const first = render(
      <QueryClientProvider client={client}>
        <ActivityHost claimId={CLAIM_A} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Activity (33)')).toBeInTheDocument();
    await publishAComment();
    await waitFor(() => expect(screen.getByText('Activity (34)')).toBeInTheDocument());

    // Away and back inside the aggregate's `staleTime`, which is the case that was broken: nothing
    // refetches, so the only thing that can still know about the comment is the cache.
    first.unmount();
    render(
      <QueryClientProvider client={client}>
        <ActivityHost claimId={CLAIM_A} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Activity (34)')).toBeInTheDocument();
  });

  it('is not counted on the next claim the reader walks to', async () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    seedAggregate(client, CLAIM_A, 33);
    seedAggregate(client, CLAIM_B, 7);

    const onA = render(
      <QueryClientProvider client={client}>
        <ActivityHost claimId={CLAIM_A} />
      </QueryClientProvider>
    );

    await publishAComment();
    await waitFor(() => expect(screen.getByText('Activity (34)')).toBeInTheDocument());

    // The route does not remount this page between records, so this is a prop change rather than a
    // fresh mount — which is exactly how the old delta leaked across.
    onA.rerender(
      <QueryClientProvider client={client}>
        <ActivityHost claimId={CLAIM_B} />
      </QueryClientProvider>
    );

    expect(screen.getByText('Activity (7)')).toBeInTheDocument();
  });
});

/**
 * Where a comment lands on the page the instant it is written.
 *
 * The thread already promises this and does it in `sortWithSessionPinned`, at every nesting level.
 * The activity merge then re-sorted the list it had just been handed, so on the claim page — the one
 * surface with both activity rows and a ranked default — the promise held everywhere except the top
 * level, which is the only level a new comment is written at.
 */
describe('a comment just written, in the merged list', () => {
  afterEach(() => {
    cleanup();
    mocks.comments = [];
    mocks.smartAccount = null;
    mocks.publishResult = { id: 'new-comment' };
    mocks.publishComment.mockClear();
  });

  it('stays at the top under Oldest, which would otherwise put it last', async () => {
    mocks.smartAccount = { account: { address: '0xabc' } };
    // The comment the composer is about to publish is the newest thing on the page, so Oldest sends
    // it to the bottom — behind a debate and a comment from three weeks earlier.
    mocks.comments = [comment('c-old', '2026-09-01T10:00:00Z'), comment('new-comment', '2026-09-24T10:00:00Z')];

    render(
      withClient(
        <CommentSection
          entityId="entity-1"
          spaceId="space-1"
          title="Activity"
          defaultSortOrder="oldest"
          activityRows={[
            {
              id: 'd-1',
              entityId: 'd-1',
              spaceId: 'space-1',
              createdAt: '2026-09-02T10:00:00Z',
              content: <span>a debate</span>,
            },
          ]}
        />
      )
    );

    // Before it is the reader's own: ordinary oldest-first order, and it is last.
    expect(screen.getAllByText(/body of |a debate/).map(node => node.textContent?.trim())).toEqual([
      'body of c-old',
      'a debate',
      'body of new-comment',
    ]);

    await publishAComment();

    await waitFor(() =>
      expect(screen.getAllByText(/body of |a debate/).map(node => node.textContent?.trim())).toEqual([
        'body of new-comment',
        'body of c-old',
        'a debate',
      ])
    );
  });
});
