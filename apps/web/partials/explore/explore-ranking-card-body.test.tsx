import { cleanup, render, screen } from '@testing-library/react';

import type React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { RankingCardBody, RankingRow } from './explore-ranking-card-body';

const entries = vi.hoisted(() => ({
  value: [] as { entityId: string; name: string; description: null; image: null; spaceId: string | null }[],
}));

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

vi.mock('~/design-system/skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

// The block-data plumbing all reads the sync store. Stub it down to a single ranked id so the body
// renders one row and the only interesting variable is which space that row is handed.
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntity: () => ({ entity: { relations: [] }, isLoading: false }),
  useValues: () => [],
}));

vi.mock('~/core/blocks/ranking/ranking-block-relations', () => ({
  getOrderedRelationTargetIds: () => ['entry-1'],
  getAggregatedRankingSubmitterRefs: () => [],
  getAggregatedRankingSubmissionCount: () => 0,
}));

vi.mock('~/core/blocks/ranking/use-ranking-submitter-space-ids', () => ({
  useResolvedRankingSubmitterSpaceIds: () => [],
}));

vi.mock('~/core/blocks/ranking/use-ranking-entry-entities', () => ({
  useRankingEntryEntities: () => ({ entries: entries.value, isLoading: false }),
}));

// Returns null without a placement, which keeps the "Rank" CTA out of the way.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// The real buttons reach into the sync engine; the row only needs them to occupy the vote slot.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ entityId, spaceId }: { entityId: string; spaceId: string }) => (
    <div data-testid="vote-buttons" data-entity-id={entityId} data-space-id={spaceId} />
  ),
}));

afterEach(() => {
  cleanup();
  entries.value = [];
});

const item = {
  entityId: 'block-1',
  spaceId: 'block-space',
  spaceName: 'Block Space',
  spaceImage: null,
  types: [],
  createdAtSec: 0,
  title: 'A ranking',
  description: null,
  imageUrl: null,
  commentCount: 0,
  recordingUrls: [],
  debateVideoUrls: [],
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
} satisfies ExploreFeedItem;

const props = {
  rank: 3,
  entityId: 'entry-1',
  spaceId: 'space-1',
  voteSpaceId: 'space-1' as string | null,
  name: 'Ethereum',
  image: null,
  resolving: false,
};

describe('RankingRow', () => {
  it('votes on the ranked entity in the known entry space', () => {
    render(<RankingRow {...props} />);

    const voteButtons = screen.getByTestId('vote-buttons');
    expect(voteButtons.getAttribute('data-entity-id')).toBe('entry-1');
    expect(voteButtons.getAttribute('data-space-id')).toBe('space-1');
  });

  it('renders the rank and a link to the entry alongside the vote buttons', () => {
    render(<RankingRow {...props} />);

    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('Ethereum').closest('a')?.getAttribute('href')).toContain('entry-1');
    expect(screen.getByTestId('vote-buttons')).toBeDefined();
  });

  it('holds the vote slot back until the entry name resolves', () => {
    render(<RankingRow {...props} name={null} voteSpaceId={null} resolving />);

    expect(screen.queryByTestId('vote-buttons')).toBeNull();
  });

  it('holds the vote slot back when the entry space is unknown', () => {
    // Loaded name, unknown vote space: show the label, omit votes (do not skeleton).
    render(<RankingRow {...props} spaceId="block-space" voteSpaceId={null} resolving={false} />);

    expect(screen.getByText('Ethereum')).toBeDefined();
    expect(screen.queryByTestId('vote-buttons')).toBeNull();
  });

  it('shows a skeleton while resolving without a name', () => {
    render(<RankingRow {...props} name={null} voteSpaceId={null} resolving />);

    expect(screen.getByTestId('skeleton')).toBeDefined();
    expect(screen.queryByText('Untitled')).toBeNull();
    expect(screen.queryByTestId('vote-buttons')).toBeNull();
  });
});

/**
 * The row itself only forwards whatever spaces it is handed. These render the body — the call
 * site that resolves entry vs block space — which is where getting it wrong writes the vote
 * into the wrong space.
 */
describe('RankingCardBody row spaces', () => {
  it('votes in the entry name-value space when it differs from the block space', () => {
    entries.value = [
      { entityId: 'entry-1', name: 'Ethereum', description: null, image: null, spaceId: 'entry-home-space' },
    ];

    render(<RankingCardBody item={item} />);

    const voteButtons = screen.getByTestId('vote-buttons');
    expect(voteButtons.getAttribute('data-entity-id')).toBe('entry-1');
    expect(voteButtons.getAttribute('data-space-id')).toBe('entry-home-space');
  });

  it('renders a loaded but nameless entry as Untitled, without a vote', () => {
    entries.value = [{ entityId: 'entry-1', name: 'Untitled', description: null, image: null, spaceId: null }];

    render(<RankingCardBody item={item} />);

    expect(screen.getByText('Untitled')).toBeDefined();
    expect(screen.queryByTestId('skeleton')).toBeNull();
    expect(screen.queryByTestId('vote-buttons')).toBeNull();
  });

  /**
   * Paging keeps the previous page's entities as `keepPreviousData`, which `useQueryEntities`
   * reports as fetched so consumers don't flash a loader over valid rows. The cost is that
   * `isLoading` is false while `byId` still holds the *old* page — so every id on the new page
   * resolves to nothing. Treat that as unresolved and skeleton rather than "Untitled".
   */
  it('skeletons while a page transition leaves the new ids unresolved', () => {
    entries.value = [];

    render(<RankingCardBody item={item} />);

    expect(screen.getByTestId('skeleton')).toBeDefined();
    expect(screen.queryByText('Untitled')).toBeNull();
    expect(screen.queryByTestId('vote-buttons')).toBeNull();
  });
});
