import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ComponentProps } from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { FeaturedRanking } from '~/core/io/subgraph/fetch-featured-rankings';

import { FeaturedRankingsSection } from './featured-rankings-section';

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: vi.fn() }),
}));

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => null,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('~/partials/blocks/table/ranking-period-metadata', () => ({
  RankingAggregatedSubmitterAvatars: () => null,
}));

vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => null,
}));

const ranking: FeaturedRanking = {
  blockEntityId: 'ranking-block',
  spaceId: 'space',
  parentEntityId: 'parent',
  relationId: 'relation',
  name: 'Best cities',
  rankingStartDate: '',
  rankingEndDate: '',
  submitterSpaceIds: [],
  submissionCount: 0,
  spaceName: null,
  spaceImage: null,
  topEntries: Array.from({ length: 7 }, (_, index) => ({
    entityId: `entity-${index + 1}`,
    name: `City ${index + 1}`,
    image: null,
  })),
};

describe('FeaturedRankingsSection', () => {
  it('shows five leaderboard entries per page', async () => {
    const user = userEvent.setup();

    render(
      <FeaturedRankingsSection
        rankings={[ranking]}
        memberOrEditorSpaceIds={new Set(['space'])}
        pendingMembershipSpaceIds={new Set()}
      />
    );

    expect(screen.getByRole('button', { name: 'City 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'City 5' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'City 6' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next entries' }));

    expect(screen.queryByRole('button', { name: 'City 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'City 6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'City 7' })).toBeInTheDocument();
  });
});
