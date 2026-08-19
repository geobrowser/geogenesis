import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  BOUNTY_STATUS_CANCELLED_ID,
  BOUNTY_STATUS_DONE_ID,
  BOUNTY_STATUS_IN_PROGRESS_ID,
  BOUNTY_STATUS_IN_REVIEW_ID,
  BOUNTY_STATUS_TODO_ID,
} from '~/core/bounties/ontology';
import type { BoardBounty } from '~/core/bounties/types';

import { BoardBountyCard, type BoardInterestBindings } from './board-bounty-card';

vi.mock('~/partials/community-tab/bounty-card', () => ({
  BountyCard: ({ bounty }: { bounty: { name: string } }) => <div data-testid="completed-card">{bounty.name}</div>,
  InProgressBountyCard: ({ bounty }: { bounty: { name: string } }) => (
    <div data-testid="in-progress-card">{bounty.name}</div>
  ),
  AvailableBountyCard: ({ bounty, isInterested }: { bounty: { name: string }; isInterested: boolean }) => (
    <div data-testid="available-card" data-interested={isInterested}>
      {bounty.name}
    </div>
  ),
}));

afterEach(cleanup);

function bounty(statusId: string | null): BoardBounty {
  return {
    id: 'b',
    spaceId: 's',
    name: 'Bounty',
    description: null,
    budget: null,
    difficulty: null,
    difficultyId: null,
    status: null,
    statusId,
    deadline: null,
    skills: [],
    maintainers: [],
    allocatedIds: [],
    interestedCount: 0,
    updatedAt: null,
    isFeatured: false,
    contributors: [],
  };
}

const interest: BoardInterestBindings = {
  interestedIds: new Set(['b']),
  isInterestLoading: false,
  canRegisterInterest: true,
  pendingBountyId: null,
  onRegisterInterest: vi.fn(),
};

describe('BoardBountyCard', () => {
  it('picks the Community-tab card by workflow status', () => {
    const cases: Array<[string | null, string]> = [
      [BOUNTY_STATUS_DONE_ID, 'completed-card'],
      [BOUNTY_STATUS_CANCELLED_ID, 'completed-card'],
      [BOUNTY_STATUS_IN_PROGRESS_ID, 'in-progress-card'],
      [BOUNTY_STATUS_IN_REVIEW_ID, 'in-progress-card'],
      [BOUNTY_STATUS_TODO_ID, 'available-card'],
      [null, 'available-card'], // missing status = Backlog
    ];
    for (const [statusId, testId] of cases) {
      const { unmount } = render(<BoardBountyCard bounty={bounty(statusId)} interest={interest} />);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      unmount();
    }
  });

  it('binds the available card to the viewer interest state', () => {
    render(<BoardBountyCard bounty={bounty(BOUNTY_STATUS_TODO_ID)} interest={interest} />);
    expect(screen.getByTestId('available-card')).toHaveAttribute('data-interested', 'true');
  });
});
