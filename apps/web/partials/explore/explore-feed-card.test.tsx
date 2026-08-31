import '@testing-library/jest-dom/vitest';
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

// EntityRowActions carries the vote buttons and the claim debate toggle, both of which reach into
// the sync engine; the card only needs it to occupy the actions slot.
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

// The ranking body pulls the sync store; stub it and surface whatever `actions` it is handed so we
// can assert the card still threads a comment link into rankings.
vi.mock('./explore-ranking-card-body', () => ({
  RankingCardBody: ({ actions, titleOpensSidePanel }: { actions?: React.ReactNode; titleOpensSidePanel?: boolean }) => (
    <div data-testid="ranking-body" data-opens-side-panel={String(titleOpensSidePanel)}>
      {actions}
    </div>
  ),
}));

vi.mock('./debate-explore-feed-card', () => ({
  DebateExploreFeedCard: ({
    fallback,
    titleOpensSidePanel,
  }: {
    fallback: React.ReactNode;
    titleOpensSidePanel?: boolean;
  }) => (
    <div data-testid="debate-card" data-opens-side-panel={String(titleOpensSidePanel)}>
      {fallback}
    </div>
  ),
}));

// The link's own behaviour has its own suite; here we only need to see which flag it was handed.
vi.mock('./explore-card-entity-link', () => ({
  ExploreCardEntityLink: ({ children, opensSidePanel }: { children: React.ReactNode; opensSidePanel?: boolean }) => (
    <a href="#" data-testid="card-title-link" data-opens-side-panel={String(opensSidePanel)}>
      {children}
    </a>
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
  recordingUrls: [],
  debateVideoUrls: [],
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

  it('routes card actions through EntityRowActions so claims keep their debate toggle', () => {
    render(<ExploreFeedCard item={item} />);

    const rowActions = screen.getByTestId('row-actions');
    expect(rowActions.contains(screen.getByText('2').closest('a'))).toBe(true);
  });

  it('links comments to the entity comments anchor with the comment count', () => {
    render(<ExploreFeedCard item={item} />);

    const commentLink = screen.getByText('2').closest('a');
    expect(commentLink).not.toBeNull();
    expect(commentLink?.getAttribute('href')).toContain('#entity-comments');
  });

  it('gives ranking cards the same actions row as every other card type', () => {
    const rankingItem: ExploreFeedItem = {
      ...item,
      types: [{ id: RANKING_BLOCK_TYPE_ID, name: 'Ranking' }],
      title: 'A ranking',
    };
    render(<ExploreFeedCard item={rankingItem} />);

    // The block is voteable in its own right, so it gets the actions row rather than a bare
    // comment link — threaded through the body's `actions` alongside its own "Rank" CTA.
    const rowActions = screen.getByTestId('row-actions');
    const commentLink = screen.getByText('2').closest('a');
    expect(commentLink).not.toBeNull();
    expect(commentLink?.getAttribute('href')).toContain('#entity-comments');
    expect(rowActions.contains(commentLink)).toBe(true);
    expect(screen.getByTestId('ranking-body').contains(rowActions)).toBe(true);
  });
  // GEO-2757. The flag travels page -> EntityFeed -> ExploreFeedCard -> body -> title, and every
  // rendition draws its own title, so a card type added later is exactly what goes quietly
  // unwired. One case per rendition, and one for the default (off) that keeps the card's other
  // homes navigating.
  describe('titleOpensSidePanel', () => {
    const COMMUNITY_CALL_TYPE_ID = '0419ca20118b4cdb84dfdb9ed73b50c2';
    const DEBATE_TYPE_ID = 'fd51f935-2063-4617-be39-7b672b23364c';

    it('reaches the default card title', () => {
      render(<ExploreFeedCard item={item} titleOpensSidePanel />);
      expect(screen.getByTestId('card-title-link')).toHaveAttribute('data-opens-side-panel', 'true');
    });

    it('reaches the community call card title', () => {
      const call = { ...item, types: [{ id: COMMUNITY_CALL_TYPE_ID, name: 'Community call' }] };
      render(<ExploreFeedCard item={call} titleOpensSidePanel />);
      expect(screen.getByTestId('card-title-link')).toHaveAttribute('data-opens-side-panel', 'true');
    });

    it('reaches the ranking card body', () => {
      const ranking = { ...item, types: [{ id: RANKING_BLOCK_TYPE_ID, name: 'Ranking block' }] };
      render(<ExploreFeedCard item={ranking} titleOpensSidePanel />);
      expect(screen.getByTestId('ranking-body')).toHaveAttribute('data-opens-side-panel', 'true');
    });

    it('reaches the debate card', () => {
      const debate = { ...item, types: [{ id: DEBATE_TYPE_ID, name: 'Debate' }] };
      render(<ExploreFeedCard item={debate} titleOpensSidePanel />);
      expect(screen.getByTestId('debate-card')).toHaveAttribute('data-opens-side-panel', 'true');
    });

    it('stays off by default, so the card keeps navigating everywhere else it is used', () => {
      render(<ExploreFeedCard item={item} />);
      expect(screen.getByTestId('card-title-link')).toHaveAttribute('data-opens-side-panel', 'false');
    });
  });
});
