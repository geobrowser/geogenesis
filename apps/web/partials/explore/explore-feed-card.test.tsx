import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';

import { ExploreFeedCard } from './explore-feed-card';

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// EntityVoteButtons reaches into the sync engine; the card only needs it to occupy the vote slot.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="vote-buttons" />,
}));

vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => null,
}));

vi.mock('./explore-ranking-card-body', () => ({
  RankingCardBody: ({ actions }: { actions?: React.ReactNode }) => <div data-testid="ranking-body">{actions}</div>,
}));

vi.mock('./debate-explore-feed-card', () => ({
  DebateExploreFeedCard: ({ fallback }: { fallback: React.ReactNode }) => (
    <div data-testid="debate-card">{fallback}</div>
  ),
}));

const item: ExploreFeedItem = {
  entityId: 'claim-1',
  spaceId: 'space-1',
  spaceName: 'Space',
  spaceImage: null,
  types: [{ id: 'claim', name: 'Claim' }],
  createdAtSec: 0,
  title: 'A claim',
  description: null,
  imageUrl: 'ipfs://image',
  commentCount: 2,
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
};

afterEach(cleanup);

describe('ExploreFeedCard', () => {
  it('routes Debate-typed items to the debate card with the generic card as fallback', () => {
    // Hyphenated on purpose: type-id comparison must ignore hyphenation.
    const debateItem: ExploreFeedItem = {
      ...item,
      types: [{ id: 'fd51f935-2063-4617-be39-7b672b23364c', name: 'Debate' }],
      title: 'A debate',
    };
    render(<ExploreFeedCard item={debateItem} />);

    const debateCard = screen.getByTestId('debate-card');
    // The generic card is handed over as the fallback, ready to render when the debate can't play.
    expect(debateCard.contains(screen.getByText('A debate'))).toBe(true);
  });

  it('does not route non-debate items to the debate card', () => {
    render(<ExploreFeedCard item={item} />);
    expect(screen.queryByTestId('debate-card')).toBeNull();
  });

  it('links comments to the entity comments anchor with the comment count', () => {
    render(<ExploreFeedCard item={item} />);

    const commentLink = screen.getByText('2').closest('a');
    expect(commentLink).not.toBeNull();
    expect(commentLink?.getAttribute('href')).toContain('#entity-comments');
  });

  it('gives ranking cards a comment link even though they render no vote buttons', () => {
    const rankingItem: ExploreFeedItem = {
      ...item,
      types: [{ id: RANKING_BLOCK_TYPE_ID, name: 'Ranking' }],
      title: 'A ranking',
    };
    render(<ExploreFeedCard item={rankingItem} />);

    // Rankings use the "Rank" button in the title row instead of up/down votes, so no vote slot...
    expect(screen.queryByTestId('vote-buttons')).toBeNull();
    // ...but they still get the comment link, threaded through the body's `actions`.
    const commentLink = screen.getByText('2').closest('a');
    expect(commentLink).not.toBeNull();
    expect(commentLink?.getAttribute('href')).toContain('#entity-comments');
    expect(screen.getByTestId('ranking-body').contains(commentLink)).toBe(true);
  });
});
