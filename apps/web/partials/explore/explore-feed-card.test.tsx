import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { ExploreFeedCard } from './explore-feed-card';

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="row-actions" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => null,
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
  it('keeps actions 4px below text even when the card has an image', () => {
    render(<ExploreFeedCard item={item} />);

    const actions = screen.getByTestId('row-actions');
    expect(actions.className).toContain('mt-1');
    expect(actions.parentElement?.contains(screen.getByText('A claim'))).toBe(true);
    expect(actions.parentElement?.parentElement?.contains(screen.getByTestId('image'))).toBe(true);
  });

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
});
