import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { EASY_DIFFICULTY_ID, HARD_DIFFICULTY_ID, MEDIUM_DIFFICULTY_ID } from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';

import { BountyBoardCard, displayedPayout, isBountyEnded } from './bounty-board-card';

vi.mock('~/design-system/geo-image', () => ({
  ThumbGeoImage: () => <span data-thumb-image />,
}));

vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({ children, href, ...rest }: React.ComponentPropsWithoutRef<'a'>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function bounty(overrides: Partial<BoardBounty> = {}): BoardBounty {
  return {
    id: 'bounty-1',
    spaceId: 'space-1',
    spaceLabel: 'Health',
    spaceImage: null,
    name: 'Add top 200 drugs',
    description: 'Curate the most prescribed medications.',
    budget: 1000,
    maxContributors: 3,
    difficulty: 'Medium',
    difficultyId: MEDIUM_DIFFICULTY_ID,
    status: 'In progress',
    statusId: null,
    deadline: '2099-01-15T00:00:00Z',
    skills: [],
    maintainers: [],
    allocatedIds: [],
    interestedCount: 0,
    updatedAt: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('displayedPayout', () => {
  it('shows the flat budget for easy or unspecified difficulty and the minimum share otherwise', () => {
    expect(displayedPayout({ budget: 1000, difficultyId: EASY_DIFFICULTY_ID })).toBe(1000);
    expect(displayedPayout({ budget: 1000, difficultyId: null })).toBe(1000);
    expect(displayedPayout({ budget: 1000, difficultyId: MEDIUM_DIFFICULTY_ID })).toBe(200);
    expect(displayedPayout({ budget: 1000, difficultyId: HARD_DIFFICULTY_ID })).toBe(200);
    expect(displayedPayout({ budget: null, difficultyId: HARD_DIFFICULTY_ID })).toBeNull();
  });
});

describe('isBountyEnded', () => {
  it('is true only for a parseable deadline in the past', () => {
    const now = Date.parse('2026-08-14T00:00:00Z');
    expect(isBountyEnded('2026-08-13T00:00:00Z', now)).toBe(true);
    expect(isBountyEnded('2026-08-15T00:00:00Z', now)).toBe(false);
    expect(isBountyEnded(null, now)).toBe(false);
    expect(isBountyEnded('garbage', now)).toBe(false);
  });
});

describe('BountyBoardCard', () => {
  it('links to the bounty entity page and renders space, minimum payout, and footer facts', () => {
    render(<BountyBoardCard bounty={bounty()} />);
    const link = screen.getByTestId('bounty-board-card');
    expect(link).toHaveAttribute('href', '/space/space-1/bounty-1');
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('Add top 200 drugs')).toBeInTheDocument();
    // Medium → 20% minimum, flagged with a plus.
    expect(screen.getByText('200+')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
  });

  it('shows the flat budget for easy bounties and Unlimited when contributors are unbounded', () => {
    render(
      <BountyBoardCard
        bounty={bounty({ difficultyId: EASY_DIFFICULTY_ID, difficulty: 'Easy', maxContributors: null })}
      />
    );
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.queryByText('1,000+')).not.toBeInTheDocument();
    expect(screen.getByText('Unlimited')).toBeInTheDocument();
  });

  it('marks past deadlines as ended', () => {
    render(<BountyBoardCard bounty={bounty({ deadline: '2020-01-01T00:00:00Z' })} />);
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });
});
