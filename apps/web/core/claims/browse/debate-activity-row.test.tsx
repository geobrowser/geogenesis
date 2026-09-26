import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity } from '~/core/types';

import { DebateActivityRow } from './debate-activity-row';

const mocks = vi.hoisted(() => ({
  commentQueries: [] as Array<{ entityId: string; enabled: boolean }>,
  transcriptError: null as Error | null,
  retryTranscript: vi.fn(),
}));

// The controls have their own suites and both reach for wallet and query context. What this file is
// about is what the row decides from its two counts: whether there is a branch under it at all.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="vote-buttons" />,
}));

vi.mock('~/partials/comments/entity-comments-button', () => ({
  EntityCommentsButton: ({ count }: { count: number }) => (
    <button type="button" data-testid="comments-button" data-count={String(count)}>
      comments
    </button>
  ),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <a {...(props as Record<string, string>)}>{children}</a>
  ),
}));

vi.mock('~/design-system/geo-image', () => ({ GeoImage: () => <span data-testid="keyframe" /> }));

vi.mock('~/partials/comments/inline-comment-composer', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  InlineCommentComposer: ({ composer }: { composer: { isComposing: boolean } }) =>
    composer.isComposing ? <div data-testid="inline-composer" /> : null,
}));

// The branch's own reads. Empty, so what the tests observe is whether the row *offered* a branch —
// not what came back inside it.
vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({
    claims: { all: [], blocks: [] },
    isLoading: false,
    error: mocks.transcriptError,
    retry: mocks.retryTranscript,
  }),
}));

vi.mock('~/core/debates/use-claim-timings', () => ({
  useClaimTimings: () => ({ timings: new Map(), isReady: true }),
}));

vi.mock('~/core/debates/hooks', () => ({ useDebateClaims: () => ({ data: null }) }));

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: ({ entityId, enabled }: { entityId: string; enabled?: boolean }) => {
    mocks.commentQueries.push({ entityId, enabled: enabled !== false });
    return { comments: [] };
  },
}));

function debate(): Entity {
  // Only the id and the name are read here; the rest of an `Entity` never reaches this component.
  return { id: 'debate-1', name: 'Practical effects | Ada vs. Ben', relations: [] } as unknown as Entity;
}

const COLLAPSE_LABEL = 'Collapse this debate';

/** Every distinct gate the branch asked its comments with, since a row renders more than once. */
function gatesOfCommentQueries(): boolean[] {
  expect(mocks.commentQueries.map(query => query.entityId)).not.toHaveLength(0);
  expect(new Set(mocks.commentQueries.map(query => query.entityId))).toEqual(new Set(['debate-1']));
  return [...new Set(mocks.commentQueries.map(query => query.enabled))];
}

function renderRow(overrides: Partial<React.ComponentProps<typeof DebateActivityRow>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DebateActivityRow
        debate={debate()}
        spaceId="claim-space"
        profilesBySpaceId={new Map()}
        sides={[]}
        responseVocabulary="stance"
        claimText="Practical effects age better than CGI."
        keyframeUrl={null}
        publishedAt={new Date('2026-09-01T00:00:00.000Z')}
        commentCount={0}
        claimCount={0}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe('DebateActivityRow', () => {
  beforeEach(() => {
    mocks.commentQueries.length = 0;
    mocks.transcriptError = null;
    mocks.retryTranscript.mockClear();
  });
  afterEach(cleanup);

  it('draws no collapse control on a debate that produced nothing and has no comments', () => {
    renderRow({ claimCount: 0, commentCount: 0 });

    expect(screen.queryByLabelText(COLLAPSE_LABEL)).not.toBeInTheDocument();
  });

  it('draws one when the debate has claims', () => {
    renderRow({ claimCount: 18, commentCount: 0 });

    expect(screen.getAllByLabelText(COLLAPSE_LABEL).length).toBeGreaterThan(0);
  });

  /**
   * The reason the counts are nullable. Both aggregates are separate requests from the debates
   * themselves, and when one fails every row on the page reported zero claims and zero comments —
   * so the branch, the spine and both collapse controls all went away, and a debate with 26
   * extracted claims became a dead end with nothing left to press.
   */
  it('keeps the branch when the claim aggregate could not answer', () => {
    renderRow({ claimCount: null, commentCount: 0 });

    expect(screen.getAllByLabelText(COLLAPSE_LABEL).length).toBeGreaterThan(0);
  });

  it('keeps the branch when the comment aggregate could not answer', () => {
    renderRow({ claimCount: 0, commentCount: null });

    expect(screen.getAllByLabelText(COLLAPSE_LABEL).length).toBeGreaterThan(0);
  });

  // The gate that saves a backlink walk per row when the aggregate says a debate is silent. An
  // aggregate that *failed* has not said that, so it must not keep the comments unreachable.
  it('fetches the debate comments when the count is unknown, and not when it is a real zero', () => {
    renderRow({ claimCount: null, commentCount: null });

    expect(gatesOfCommentQueries()).toEqual([true]);

    cleanup();
    mocks.commentQueries.length = 0;
    renderRow({ claimCount: 4, commentCount: 0 });

    expect(gatesOfCommentQueries()).toEqual([false]);
  });

  it('prints the claim count it was given, and prints nothing when it has none', () => {
    const { unmount } = renderRow({ claimCount: 18 });
    expect(screen.getByLabelText('18 extracted claims')).toBeInTheDocument();
    unmount();

    renderRow({ claimCount: null });
    expect(screen.queryByLabelText(/extracted claim/)).not.toBeInTheDocument();
  });
});

/**
 * A debate whose transcript could not be read is not a debate that produced nothing.
 *
 * The hook answers with the same empty grouping either way — deliberately, because "no claims yet" is
 * a real state for a chunk of the corpus that predates claim extraction. So the branch stayed silent
 * on a failure, which put "nothing here" under a row that was simultaneously advertising eighteen
 * extracted claims, with nothing to press and no way to tell which had happened.
 */
describe('DebateActivityRow when the transcript will not load', () => {
  beforeEach(() => {
    mocks.commentQueries.length = 0;
    mocks.transcriptError = null;
    mocks.retryTranscript.mockClear();
  });
  afterEach(cleanup);

  it('says so, and offers to try again', () => {
    mocks.transcriptError = new Error('transcript unavailable');
    renderRow({ claimCount: 18, commentCount: 0 });

    expect(screen.getByText(/Couldn’t load the claims from this debate/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mocks.retryTranscript).toHaveBeenCalledOnce();
  });

  // The ordinary empty debate still says nothing: a line under every old debate is noise, which is
  // why silence was chosen in the first place.
  it('stays silent when the transcript loaded and there was simply nothing in it', () => {
    renderRow({ claimCount: 18, commentCount: 0 });

    expect(screen.queryByText(/Couldn’t load the claims/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
