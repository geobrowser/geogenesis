import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GraphClaimRow } from './graph-claim-row';

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  voteButtons: vi.fn(),
}));

vi.mock('~/core/claims/browse/claim-response-summary', () => ({ useClaimResponseSummary: mocks.summary }));
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: (props: Record<string, unknown>) => {
    mocks.voteButtons(props);
    return <span>vote buttons</span>;
  },
}));
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const CLAIM_SPACE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const claim = { id: 'c'.repeat(32), name: 'Hamas must disarm before Israel withdraws', spaceId: CLAIM_SPACE };

const summary = (overrides: Record<string, unknown>) => ({
  positive: 0,
  negative: 0,
  total: 0,
  percent: null,
  hasCounts: true,
  isLoading: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GraphClaimRow', () => {
  it('reads, links and votes in the claim’s own space', () => {
    mocks.summary.mockReturnValue(summary({}));
    render(
      <ul>
        <GraphClaimRow claim={claim} />
      </ul>
    );

    expect(mocks.summary).toHaveBeenCalledWith(claim.id, CLAIM_SPACE, 'stance');
    expect(mocks.voteButtons).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: claim.id, spaceId: CLAIM_SPACE, responseKind: 'stance' })
    );
    expect(screen.getByRole('link', { name: claim.name }).getAttribute('href')).toBe(
      `/space/${CLAIM_SPACE}/${claim.id}`
    );
  });

  it('says there are no responses rather than showing an empty bar', () => {
    mocks.summary.mockReturnValue(summary({}));
    render(
      <ul>
        <GraphClaimRow claim={claim} />
      </ul>
    );
    expect(screen.getByText('No responses yet')).toBeTruthy();
  });

  it('shows the overall agree share', () => {
    mocks.summary.mockReturnValue(summary({ positive: 3, negative: 1, total: 4, percent: 75 }));
    render(
      <ul>
        <GraphClaimRow claim={claim} />
      </ul>
    );
    expect(screen.getByText('75% agree · 4 responses')).toBeTruthy();
    expect(screen.getByRole('img', { name: '75% agree' })).toBeTruthy();
  });

  it('does not claim emptiness when the counts did not answer', () => {
    mocks.summary.mockReturnValue(summary({ hasCounts: false }));
    render(
      <ul>
        <GraphClaimRow claim={claim} />
      </ul>
    );
    expect(screen.queryByText('No responses yet')).toBeNull();
    expect(screen.getByText('Responses unavailable')).toBeTruthy();
  });
});
