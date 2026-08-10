import { render, screen } from '@testing-library/react';

import type React from 'react';

import { describe, expect, it, vi } from 'vitest';

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

describe('ExploreFeedCard', () => {
  it('keeps actions 6px below text even when the card has an image', () => {
    render(<ExploreFeedCard item={item} />);

    const actions = screen.getByTestId('row-actions');
    expect(actions.className).toContain('mt-[6px]');
    expect(actions.parentElement?.contains(screen.getByText('A claim'))).toBe(true);
    expect(actions.parentElement?.parentElement?.contains(screen.getByTestId('image'))).toBe(true);
  });
});
