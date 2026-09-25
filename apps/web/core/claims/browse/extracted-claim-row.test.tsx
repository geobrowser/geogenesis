import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ClaimTiming } from '~/core/debates/claim-timing';

import type { OrderedTranscriptClaim } from './claim-activity-order';
import { ExtractedClaimRow } from './extracted-claim-row';

// The two controls are covered by their own suites and both reach for wallet/query context. What
// this file is about is what the row decides: which timing may be shown, and whether the claim can
// be acted on at all.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ entityId, spaceId, responseKind, claimResponderAvatarsPosition }: Record<string, unknown>) => (
    <div
      data-testid="vote-buttons"
      data-entity={String(entityId)}
      data-space={String(spaceId)}
      data-kind={String(responseKind)}
      data-avatars={String(claimResponderAvatarsPosition)}
    />
  ),
}));

// `PrefetchLink` warms the sync engine on hover, so it needs that provider. The hrefs are what
// this file asserts, and a plain anchor carries those.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => (
    <a {...(props as Record<string, string>)}>{children}</a>
  ),
}));

vi.mock('~/partials/comments/entity-comments-button', () => ({
  EntityCommentsButton: ({
    entityId,
    count,
    onActivate,
  }: {
    entityId: string;
    count: number;
    onActivate?: () => void;
  }) => (
    <button type="button" data-testid="comments-button" data-entity={entityId} data-count={String(count)} onClick={onActivate}>
      comments
    </button>
  ),
}));

const mocks = vi.hoisted(() => ({ openedProfiles: [] as string[] }));

vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({
  useOpenDebaterProfile: (spaceId: string | undefined) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (spaceId) mocks.openedProfiles.push(spaceId);
  },
}));

// Covered where it lives; here the question is only whether pressing comment opens one in place
// rather than sending the reader to the panel.
vi.mock('~/partials/comments/inline-comment-composer', async importOriginal => ({
  ...((await importOriginal()) as Record<string, unknown>),
  InlineCommentComposer: ({ targetEntityId }: { targetEntityId: string }) => (
    <div data-testid="inline-composer" data-target={targetEntityId} />
  ),
}));

function claim(overrides: Partial<OrderedTranscriptClaim> = {}): OrderedTranscriptClaim {
  return {
    id: 'claim-1',
    text: 'Practical effects age better than CGI.',
    spaceId: 'claim-space',
    blockId: 'block-1',
    publishedTiming: null,
    relationEntityId: null,
    restated: false,
    timing: null,
    ...overrides,
  };
}

function timing(overrides: Partial<ClaimTiming> = {}): ClaimTiming {
  return { startMs: 724_000, endMs: 730_000, confidence: 1, source: 'published', ...overrides };
}

function renderRow(overrides: Partial<React.ComponentProps<typeof ExtractedClaimRow>> = {}) {
  // A row with comments and depth left mounts the list that fetches them, which needs a client even
  // though this file never lets it resolve.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExtractedClaimRow
        claim={claim()}
        debateId="debate-1"
        debateSpaceId="debate-space"
        responseKind="stance"
        responseVocabulary="stance"
        speaker={{ spaceId: 'speaker-space', name: 'Ada Reyes' }}
        speakerPosition={null}
        depth={2}
        {...overrides}
      />
    </QueryClientProvider>
  );
}

describe('ExtractedClaimRow', () => {
  afterEach(cleanup);

  it('shows the speaker the turn was attributed to', () => {
    renderRow();

    expect(screen.getByText('Ada Reyes')).toBeInTheDocument();
  });

  it('falls back to a placeholder rather than a blank byline when the speaker has no name', () => {
    renderRow({ speaker: { spaceId: 'speaker-space', name: null } });

    expect(screen.getByText('Unnamed debater')).toBeInTheDocument();
  });

  it('links a published moment back to the debate, backing off by the pre-roll', () => {
    renderRow({ claim: claim({ timing: timing() }) });

    const link = screen.getByRole('link', { name: 'Watch from 12:04' });
    expect(link).toHaveTextContent('12:04');
    // 724s minus the two-second lead-in, so the sentence is not clipped by its own start.
    expect(link).toHaveAttribute('href', expect.stringContaining('t=722'));
    expect(link).toHaveAttribute('href', expect.stringContaining('debate-space'));
    expect(link).toHaveAttribute('href', expect.stringContaining('debate-1'));
  });

  it('still offers the jump for a transcript match that clears the assertable bar', () => {
    renderRow({ claim: claim({ timing: timing({ confidence: 0.62, source: 'segment' }) }) });

    expect(screen.getByRole('link', { name: 'Watch from 12:04' })).toBeInTheDocument();
  });

  // A block fallback places the claim at the start of the turn, which can be most of a minute
  // early. Good enough to order by, not good enough to state or to seek to.
  it('prints no timecode and offers no jump for a timing below the assertable bar', () => {
    renderRow({ claim: claim({ timing: timing({ confidence: 0, source: 'block' }) }) });

    expect(screen.queryByRole('link', { name: /Watch from/ })).not.toBeInTheDocument();
    expect(screen.getByText('moment not found')).toBeInTheDocument();
  });

  it('says so when nothing could place the claim at all', () => {
    renderRow({ claim: claim({ timing: null }) });

    expect(screen.getByText('moment not found')).toBeInTheDocument();
  });

  it('tags the speaker with the side they argued in the debate', () => {
    renderRow({ speakerPosition: true });

    expect(screen.getByText('Agree')).toBeInTheDocument();

    cleanup();
    renderRow({ speakerPosition: false });

    expect(screen.getByText('Disagree')).toBeInTheDocument();
  });

  it('uses the claim’s own vocabulary for that tag', () => {
    renderRow({ speakerPosition: false, responseVocabulary: 'veracity' });

    expect(screen.getByText('Dispute')).toBeInTheDocument();
  });

  // A debater the debate does not record on either side gets no tag rather than a guessed one.
  it('draws no side tag when the debate records no side for the speaker', () => {
    renderRow({ speakerPosition: null });

    expect(screen.queryByText('Agree')).not.toBeInTheDocument();
    expect(screen.queryByText('Disagree')).not.toBeInTheDocument();
  });

  it('passes the resolved response kind and trailing avatars to the vote control', () => {
    renderRow({ responseKind: 'veracity' });

    const votes = screen.getByTestId('vote-buttons');
    expect(votes).toHaveAttribute('data-kind', 'veracity');
    expect(votes).toHaveAttribute('data-avatars', 'trailing');
  });

  // The claim lives in the debate's space, not the page's — pointing a vote anywhere else records
  // it where the claim does not live, which reads back as a claim nobody answered.
  it('votes against the space the claim actually lives in', () => {
    renderRow({ claim: claim({ spaceId: 'somewhere-else' }) });

    expect(screen.getByTestId('vote-buttons')).toHaveAttribute('data-space', 'somewhere-else');
  });

  it('renders read-only when the graph reports no home space for the claim', () => {
    renderRow({ claim: claim({ spaceId: null }) });

    expect(screen.queryByTestId('vote-buttons')).not.toBeInTheDocument();
    expect(screen.queryByTestId('comments-button')).not.toBeInTheDocument();
    // The sentence is still readable, just not actionable.
    expect(screen.getByText('Practical effects age better than CGI.')).toBeInTheDocument();
  });

  it('shows the server-counted comments rather than seeding the button at zero', () => {
    renderRow({ commentCount: 4 });

    expect(screen.getByTestId('comments-button')).toHaveAttribute('data-count', '4');
  });

  it('links the sentence to the claim in its own space', () => {
    renderRow();

    const link = screen.getByRole('link', { name: 'Practical effects age better than CGI.' });
    expect(link).toHaveAttribute('href', expect.stringContaining('claim-space'));
  });
});

describe('ExtractedClaimRow, saying what it is and answering in place', () => {
  afterEach(() => {
    cleanup();
    mocks.openedProfiles.length = 0;
  });

  // A claim with no assertable moment and a comment from someone holding no position carry the same
  // furniture, so the row says which it is rather than leaving it to be inferred.
  it('labels itself a claim', () => {
    renderRow();

    expect(screen.getByText('Claim')).toBeInTheDocument();
  });

  it('opens the speaker profile beside the thread instead of navigating to their space', () => {
    renderRow();

    fireEvent.click(screen.getByText('Ada Reyes'));

    expect(mocks.openedProfiles).toEqual(['speaker-space']);
  });

  it('opens a composer against the claim rather than the comments panel', () => {
    renderRow();

    fireEvent.click(screen.getByTestId('comments-button'));

    expect(screen.getByTestId('inline-composer')).toHaveAttribute('data-target', 'claim-1');
  });

  it('closes it again when the same control is pressed twice', () => {
    renderRow();
    const button = screen.getByTestId('comments-button');

    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.queryByTestId('inline-composer')).not.toBeInTheDocument();
  });
});
