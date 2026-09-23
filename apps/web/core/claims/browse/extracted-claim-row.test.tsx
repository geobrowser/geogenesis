import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
  EntityCommentsButton: ({ entityId }: { entityId: string }) => (
    <div data-testid="comments-button" data-entity={entityId} />
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
  return render(
    <ExtractedClaimRow
      claim={claim()}
      debateId="debate-1"
      debateSpaceId="debate-space"
      responseKind="stance"
      speaker={{ spaceId: 'speaker-space', name: 'Ada Reyes' }}
      {...overrides}
    />
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

  it('links the sentence to the claim in its own space', () => {
    renderRow();

    const link = screen.getByRole('link', { name: 'Practical effects age better than CGI.' });
    expect(link).toHaveAttribute('href', expect.stringContaining('claim-space'));
  });
});
